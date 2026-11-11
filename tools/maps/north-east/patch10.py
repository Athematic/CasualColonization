R = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/packages/engine/src/'
def patch(f, pairs):
    p = R + f
    s = open(p).read()
    for a, b in pairs:
        assert a in s, (f, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

patch('scenarios/north-east.ts', [
    ("""    // Places of Mi'kma'ki by their Mi'kmaw names, kept today (Halifax, the Shubenacadie, Antigonish, Pictou, Richibucto, Restigouche).
    townNames: ['Kjipuktuk', 'Sipekne’katik', 'Nalkitkoniash', 'Piktuk', 'Elsipogtog', 'Listuguj', 'Esgenoôpetitj', 'Unama’ki', 'Epekwitk', 'Wagmatcook', 'Eskasoni'],""",
     """    // Places of Mi'kma'ki by their Mi'kmaw names, used today (Halifax, the Shubenacadie, Pictou, Richibucto, Restigouche, Burnt Church, Cape Breton, Prince Edward Island).
    townNames: ['Kjipuktuk', "Sipekne'katik", 'Piktuk', 'Elsipogtog', 'Listuguj', 'Esgenoôpetitj', "Unama'ki", 'Epekwitk', 'Wagmatcook', 'Eskasoni'],"""),
    ("""    // Innu places of Nitassinan by their Innu names (Tadoussac, Sept-Îles, Mingan, Natashquan, Sheshatshiu, Mashteuiatsh).
    townNames: ['Totouskak', 'Uashat', 'Ekuanitshit', 'Nutashkuan', 'Sheshatshiu', 'Mashteuiatsh', 'Pessamit', 'Unamen Shipu', 'Pakua Shipi', 'Matimekush'],""",
     """    // Innu communities of Nitassinan by their Innu names (Sept-Îles, Mingan, Natashquan, Sheshatshiu, Mashteuiatsh, Betsiamites, La Romaine, Saint-Augustin, Schefferville, Natuashish).
    townNames: ['Uashat', 'Ekuanitshit', 'Nutashkuan', 'Sheshatshiu', 'Mashteuiatsh', 'Pessamit', 'Unamen Shipu', 'Pakua Shipi', 'Matimekush', 'Natuashish'],"""),
    ("""    townNames: ['Ossossané', 'Teanaostaiaé', 'Taenhatentaron', 'Cahiagué', 'Ihonatiria', 'Scanonaenrat', 'Contarea', 'Taenhatentaron', 'Arontaen'],""",
     """    townNames: ['Ossossané', 'Teanaostaiaé', 'Taenhatentaron', 'Cahiagué', 'Ihonatiria', 'Scanonaenrat', 'Contarea', 'Toanché', 'Arontaen'],"""),
    ("""      // The Basque whaling harbours of the Strait of Belle Isle, and Placentia's Basque name.""",
     """      // The Basque whaling harbours of the Strait of Belle Isle as the Basque records name them (Red Bay
      // was Butus), and Placentia's Basque name: from Barkham's work, to be checked (note, section 13)."""),
])
patch('rules/nations.ts', [
    ("""   * Odawa kin): hunters and traders who held the river route to the interior; the Kichesipirini of
   * Morrison Island took tolls from those who passed.""",
     """   * Odawa kin): hunters and traders who held the river route to the interior; the Kichesipirini of
   * Allumette Island, on the Ottawa, took tolls from those who passed."""),
])
