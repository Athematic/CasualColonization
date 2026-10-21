// PNG checks for the image generator (loaded with Add-Type by ImageGen.psm1).
// Reads the IHDR colour type, inflates the image data and counts transparent pixels,
// and spots the "painted checkerboard" that image models draw when they fake transparency.
// Also contains a tiny PNG encoder used by the tests and the fake API server.
using System;
using System.IO;
using System.IO.Compression;

namespace ImageGenTool
{
    public sealed class PngReport
    {
        public bool IsPng { get; set; }
        public string Error { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public int BitDepth { get; set; }
        public int ColorType { get; set; } = -1;
        public int Interlace { get; set; }
        /// <summary>Colour type 4 or 6, or a tRNS chunk.</summary>
        public bool HasAlphaChannel { get; set; }
        public bool HasTrns { get; set; }
        public bool PixelsAnalysed { get; set; }
        public long TotalPixels { get; set; }
        /// <summary>Pixels with alpha at most 16 (of 255).</summary>
        public long TransparentPixels { get; set; }
        /// <summary>Pixels with alpha between 17 and 239.</summary>
        public long TranslucentPixels { get; set; }
        public double TransparentFraction { get; set; }
        /// <summary>The opaque corners consist of two distinct light neutral tones: a drawn checkerboard.</summary>
        public bool CheckerboardSuspected { get; set; }

        public string ColorTypeName
        {
            get
            {
                switch (ColorType)
                {
                    case 0: return "greyscale";
                    case 2: return "RGB";
                    case 3: return "palette";
                    case 4: return "greyscale+alpha";
                    case 6: return "RGBA";
                    default: return "unknown";
                }
            }
        }
    }

    public static class PngInspector
    {
        static readonly byte[] Signature = { 137, 80, 78, 71, 13, 10, 26, 10 };

        public static PngReport InspectFile(string path)
        {
            return Inspect(File.ReadAllBytes(path));
        }

        static int ReadInt(byte[] b, int o)
        {
            return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
        }

        public static PngReport Inspect(byte[] data)
        {
            var r = new PngReport();
            if (data == null || data.Length < 33) { r.Error = "file too small to be a PNG"; return r; }
            for (int i = 0; i < 8; i++)
            {
                if (data[i] != Signature[i]) { r.Error = "missing PNG signature"; return r; }
            }
            r.IsPng = true;
            byte[] trns = null;
            var idat = new MemoryStream();
            bool sawIhdr = false;
            int pos = 8;
            while (pos + 8 <= data.Length)
            {
                int len = ReadInt(data, pos);
                if (len < 0 || pos + 12L + len > data.Length) { r.Error = "truncated chunk"; break; }
                string type = System.Text.Encoding.ASCII.GetString(data, pos + 4, 4);
                int body = pos + 8;
                if (type == "IHDR" && len >= 13)
                {
                    r.Width = ReadInt(data, body);
                    r.Height = ReadInt(data, body + 4);
                    r.BitDepth = data[body + 8];
                    r.ColorType = data[body + 9];
                    r.Interlace = data[body + 12];
                    sawIhdr = true;
                }
                else if (type == "tRNS")
                {
                    trns = new byte[len];
                    Array.Copy(data, body, trns, 0, len);
                    r.HasTrns = true;
                }
                else if (type == "IDAT")
                {
                    idat.Write(data, body, len);
                }
                else if (type == "IEND")
                {
                    break;
                }
                pos = body + len + 4;
            }
            if (!sawIhdr) { r.IsPng = false; r.Error = "no IHDR chunk"; return r; }
            r.HasAlphaChannel = r.ColorType == 4 || r.ColorType == 6 || r.HasTrns;
            r.TotalPixels = (long)r.Width * r.Height;
            if (r.Error != null) return r;
            try { Analyse(r, idat.ToArray(), trns); }
            catch (Exception e) { r.Error = "pixel analysis failed: " + e.Message; }
            return r;
        }

        static void Analyse(PngReport r, byte[] z, byte[] trns)
        {
            if (r.Interlace != 0) return; // light check only: interlaced files report the header facts
            int channels;
            switch (r.ColorType)
            {
                case 0: channels = 1; break;
                case 2: channels = 3; break;
                case 3: channels = 1; break;
                case 4: channels = 2; break;
                case 6: channels = 4; break;
                default: return;
            }
            int w = r.Width, h = r.Height;
            if (w <= 0 || h <= 0) return;
            int bits = channels * r.BitDepth;
            int bpp = Math.Max(1, bits / 8);
            long strideL = ((long)w * bits + 7) / 8;
            if (strideL > int.MaxValue / 4) return;
            int stride = (int)strideL;
            if (z.Length < 3) throw new InvalidDataException("no image data");

            bool rgb8 = r.BitDepth == 8 && (r.ColorType == 2 || r.ColorType == 6);
            int patch = Math.Max(4, Math.Min(w, h) / 8);
            long cornerTotal = 0, cornerLight = 0;
            var bins = new long[32];

            // Skip the 2-byte zlib header; DeflateStream works on every .NET that PowerShell 7 runs on.
            using (var ms = new MemoryStream(z, 2, z.Length - 2))
            using (var inflate = new DeflateStream(ms, CompressionMode.Decompress))
            {
                var prev = new byte[stride];
                var cur = new byte[stride];
                for (int y = 0; y < h; y++)
                {
                    int f = inflate.ReadByte();
                    if (f < 0) throw new InvalidDataException("image data ends early");
                    ReadFully(inflate, cur, stride);
                    Unfilter(f, cur, prev, bpp, stride);
                    bool cornerRow = y < patch || y >= h - patch;
                    for (int x = 0; x < w; x++)
                    {
                        int alpha = Alpha(r, cur, x, trns);
                        if (alpha <= 16) r.TransparentPixels++;
                        else if (alpha < 240) r.TranslucentPixels++;
                        if (rgb8 && cornerRow && (x < patch || x >= w - patch) && alpha >= 240)
                        {
                            int o = x * channels;
                            int R = cur[o], G = cur[o + 1], B = cur[o + 2];
                            int mx = Math.Max(R, Math.Max(G, B)), mn = Math.Min(R, Math.Min(G, B));
                            cornerTotal++;
                            if (mn >= 150 && mx - mn <= 14)
                            {
                                cornerLight++;
                                bins[(R + G + B) / 3 / 8]++;
                            }
                        }
                    }
                    var t = prev; prev = cur; cur = t;
                }
            }
            r.PixelsAnalysed = true;
            r.TransparentFraction = r.TotalPixels > 0 ? (double)r.TransparentPixels / r.TotalPixels : 0;

            // A drawn checkerboard: the opaque corners are almost all light neutral greys,
            // split between two clearly different tones (e.g. white and #cccccc).
            if (cornerTotal > 0 && cornerLight >= 0.8 * cornerTotal)
            {
                int a = 0;
                for (int i = 1; i < 32; i++) if (bins[i] > bins[a]) a = i;
                int b = -1;
                for (int i = 0; i < 32; i++)
                {
                    if (Math.Abs(i - a) >= 2 && (b < 0 || bins[i] > bins[b])) b = i;
                }
                if (b >= 0 && bins[a] >= 0.15 * cornerTotal && bins[b] >= 0.15 * cornerTotal)
                    r.CheckerboardSuspected = true;
            }
        }

        static int Alpha(PngReport r, byte[] row, int x, byte[] trns)
        {
            switch (r.ColorType)
            {
                case 6: return r.BitDepth == 8 ? row[x * 4 + 3] : row[x * 8 + 6];
                case 4: return r.BitDepth == 8 ? row[x * 2 + 1] : row[x * 4 + 2];
                case 3:
                    if (trns == null) return 255;
                    int idx;
                    if (r.BitDepth == 8) idx = row[x];
                    else
                    {
                        int perByte = 8 / r.BitDepth;
                        int shift = 8 - r.BitDepth * (x % perByte + 1);
                        idx = (row[x / perByte] >> shift) & ((1 << r.BitDepth) - 1);
                    }
                    return idx < trns.Length ? trns[idx] : 255;
                default:
                    return 255; // colour-key transparency (tRNS on grey or RGB) is not evaluated
            }
        }

        static void Unfilter(int f, byte[] cur, byte[] prev, int bpp, int n)
        {
            switch (f)
            {
                case 0: return;
                case 1:
                    for (int i = bpp; i < n; i++) cur[i] = (byte)(cur[i] + cur[i - bpp]);
                    return;
                case 2:
                    for (int i = 0; i < n; i++) cur[i] = (byte)(cur[i] + prev[i]);
                    return;
                case 3:
                    for (int i = 0; i < n; i++)
                    {
                        int left = i >= bpp ? cur[i - bpp] : 0;
                        cur[i] = (byte)(cur[i] + ((left + prev[i]) >> 1));
                    }
                    return;
                case 4:
                    for (int i = 0; i < n; i++)
                    {
                        int a = i >= bpp ? cur[i - bpp] : 0;
                        int b = prev[i];
                        int c = i >= bpp ? prev[i - bpp] : 0;
                        int p = a + b - c;
                        int pa = Math.Abs(p - a), pb = Math.Abs(p - b), pc = Math.Abs(p - c);
                        int pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
                        cur[i] = (byte)(cur[i] + pr);
                    }
                    return;
                default:
                    throw new InvalidDataException("bad PNG filter type " + f);
            }
        }

        static void ReadFully(Stream s, byte[] buf, int n)
        {
            int off = 0;
            while (off < n)
            {
                int k = s.Read(buf, off, n - off);
                if (k <= 0) throw new InvalidDataException("image data ends early");
                off += k;
            }
        }
    }

    /// <summary>Minimal 8-bit RGB / RGBA PNG encoder (tests and the fake API server).</summary>
    public static class PngWriter
    {
        static uint[] crcTable;

        static uint Crc(byte[] buf, uint c)
        {
            if (crcTable == null)
            {
                var t = new uint[256];
                for (uint n = 0; n < 256; n++)
                {
                    uint k = n;
                    for (int j = 0; j < 8; j++) k = (k & 1) != 0 ? 0xEDB88320u ^ (k >> 1) : k >> 1;
                    t[n] = k;
                }
                crcTable = t;
            }
            foreach (byte b in buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >> 8);
            return c;
        }

        static void WriteBE(Stream s, uint v)
        {
            s.WriteByte((byte)(v >> 24)); s.WriteByte((byte)(v >> 16)); s.WriteByte((byte)(v >> 8)); s.WriteByte((byte)v);
        }

        static void Chunk(Stream s, string type, byte[] data)
        {
            WriteBE(s, (uint)data.Length);
            byte[] t = System.Text.Encoding.ASCII.GetBytes(type);
            s.Write(t, 0, 4);
            s.Write(data, 0, data.Length);
            uint c = Crc(t, 0xFFFFFFFFu);
            c = Crc(data, c);
            WriteBE(s, c ^ 0xFFFFFFFFu);
        }

        public static byte[] Encode(int width, int height, bool alpha, byte[] pixels)
        {
            int ch = alpha ? 4 : 3;
            int stride = width * ch;
            if (pixels.Length != stride * height) throw new ArgumentException("pixel buffer size does not match width x height x channels");
            var raw = new MemoryStream();
            for (int y = 0; y < height; y++) { raw.WriteByte(0); raw.Write(pixels, y * stride, stride); }
            byte[] rawBytes = raw.ToArray();

            var z = new MemoryStream();
            z.WriteByte(0x78); z.WriteByte(0x9C);
            using (var d = new DeflateStream(z, CompressionLevel.Optimal, true)) d.Write(rawBytes, 0, rawBytes.Length);
            uint s1 = 1, s2 = 0;
            foreach (byte b in rawBytes) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
            WriteBE(z, (s2 << 16) | s1);

            var ihdr = new MemoryStream();
            WriteBE(ihdr, (uint)width); WriteBE(ihdr, (uint)height);
            ihdr.WriteByte(8); ihdr.WriteByte((byte)(alpha ? 6 : 2)); ihdr.WriteByte(0); ihdr.WriteByte(0); ihdr.WriteByte(0);

            var png = new MemoryStream();
            png.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, 0, 8);
            Chunk(png, "IHDR", ihdr.ToArray());
            Chunk(png, "IDAT", z.ToArray());
            Chunk(png, "IEND", new byte[0]);
            return png.ToArray();
        }

        /// <summary>
        /// Sample images: "alpha" (red disc on a truly transparent background), "opaque-alpha" (RGBA but
        /// every pixel opaque), "rgb" (red disc on white, no alpha) and "checker" (red disc on a painted
        /// white and grey checkerboard, no alpha: the fake transparency the tool must catch).
        /// </summary>
        public static byte[] Sample(string kind, int size)
        {
            bool alpha = kind == "alpha" || kind == "opaque-alpha";
            int ch = alpha ? 4 : 3;
            var px = new byte[size * size * ch];
            double c = (size - 1) / 2.0, rad = size * 0.3;
            int cell = Math.Max(2, size / 8);
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    int o = (y * size + x) * ch;
                    bool disc = (x - c) * (x - c) + (y - c) * (y - c) <= rad * rad;
                    byte r, g, b, a = 255;
                    if (disc) { r = 210; g = 60; b = 42; }
                    else if (kind == "alpha") { r = 0; g = 0; b = 0; a = 0; }
                    else if (kind == "checker") { bool light = ((x / cell) + (y / cell)) % 2 == 0; r = g = b = (byte)(light ? 255 : 204); }
                    else { r = 255; g = 253; b = 246; }
                    px[o] = r; px[o + 1] = g; px[o + 2] = b;
                    if (alpha) px[o + 3] = a;
                }
            }
            return Encode(size, size, alpha, px);
        }
    }
}
