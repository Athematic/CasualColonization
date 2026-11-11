import sys
D = '/tmp/claude-0/-home-user-CasualColonization/b9a40597-a79c-5e47-82fb-9e655e0414a5/scratchpad/s8/'
def clean(f, skip):
    return [l for l in open(D + f).read().split('\n') if l.strip() and not any(k in l for k in skip)]
a = clean(sys.argv[1] + '.out', ['rolldown', 'chunk', '> ']) ; b = clean(sys.argv[2] + '.out', ['rolldown', 'chunk', '> '])
c = clean(sys.argv[1] + '.err', ['Done in']); d = clean(sys.argv[2] + '.err', ['Done in'])
print('out same' if a == b else 'OUT DIFFERS', len(a), len(b))
print('err same' if c == d else 'ERR DIFFERS', len(c), len(d))
for x, y in zip(a + c, b + d):
    if x != y:
        print('-', x[:300]); print('+', y[:300]); break
