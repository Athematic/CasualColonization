D = '/tmp/claude-0/-home-user-CasualColonization/b9a40597-a79c-5e47-82fb-9e655e0414a5/scratchpad/ne/'
p = D + 'emit.py'
s = open(p).read()
rep = {
    "    ('wendat', None, (-80.4, 44.1, -78.8, 45.0, 2, None, None)),": "    ('wendat', None, (-80.6, 44.0, -78.8, 45.0, 3, None, None)),",
    """    ('haudenosaunee', None, (-75.0, 42.6, -73.8, 43.2, 1, None, None)),
    ('haudenosaunee', None, (-76.3, 42.6, -75.1, 43.2, 1, None, None)),
    ('haudenosaunee', None, (-77.9, 42.4, -76.4, 43.2, 2, None, None)),""": """    ('haudenosaunee', None, (-74.9, 42.7, -73.9, 43.1, 1, None, None)),
    ('haudenosaunee', None, (-75.8, 42.7, -75.3, 43.2, 1, None, None)),
    ('haudenosaunee', None, (-76.3, 42.7, -75.9, 43.2, 1, None, None)),
    ('haudenosaunee', None, (-76.9, 42.6, -76.4, 43.1, 1, None, None)),
    ('haudenosaunee', None, (-77.8, 42.5, -77.0, 43.1, 1, None, None)),""",
    "    ('narragansett', None, (-72.0, 41.3, -71.3, 41.95, 1, None, None)),": "    ('narragansett', None, (-71.9, 41.3, -71.3, 42.0, 1, None, None)),",
    "    ('mohican', None, (-74.0, 41.9, -73.2, 43.0, 2, None, None)),": "    ('mohican', None, (-74.1, 41.9, -73.2, 43.0, 2, None, None)),",
    "the scenario spaces settlements 3 tiles apart.": "the scenario spaces settlements 2 tiles apart.",
}
for a, b in rep.items():
    assert a in s, a
    s = s.replace(a, b)
s = s.replace("('haudenosaunee', 'The Haudenosaunee: the Mohawk in the east, the Oneida and Onondaga in the middle, the Cayuga and Seneca in the west.', None)",
              "('haudenosaunee', 'The Haudenosaunee, a town for each of the Five Nations, east to west: the Mohawk, the Oneida, the Onondaga, the Cayuga and the Seneca.', None)")
open(p, 'w').write(s)
