#!/usr/bin/env python3
"""
gen_imports_films.py
Reads Filmweb2Letterboxd_film.csv and outputs imports_films.js
Classification: Movies / Feature Animation / Shorts
"""

import csv
import re
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH   = os.path.join(SCRIPT_DIR, 'Filmweb2Letterboxd_film.csv')
DATA_JS    = os.path.join(SCRIPT_DIR, 'data.js')
OUT_PATH   = os.path.join(SCRIPT_DIR, 'imports_films.js')

# ─── Year threshold: year ≤ this → always Shorts (early cinema era) ──────────
EARLY_CINEMA_YEAR = 1916

# ─── Year-specific overrides (title, year) → medium ─────────────────────────
YEAR_SPECIFIC = {
    ('9',                         2009): 'Feature Animation',  # Shane Acker feature
    ('9',                         2005): 'Shorts',             # Shane Acker 11-min short
    ('Alice in Wonderland',       2010): 'Movies',             # Tim Burton live-action
    ('Alice in Wonderland',       1951): 'Feature Animation',  # Disney animated
    ('Cargo',                     2017): 'Movies',             # Australian live-action feature
    ('Cargo',                     2013): 'Shorts',             # 7-min Australian short
    ('The Lion King',             1994): 'Feature Animation',
    ('The Lion King',             2019): 'Movies',             # photorealistic remake
    ('Robin Hood',                1973): 'Feature Animation',  # Disney animated
    ('Frankenweenie',             1984): 'Shorts',             # Tim Burton 30-min live-action short
    ('Frankenweenie',             2012): 'Feature Animation',  # stop-motion feature
    ('It\'s Such a Beautiful Day',2012): 'Feature Animation',  # 62-min compiled feature
    ('It\'s Such a Beautiful Day',2011): 'Shorts',             # 22-min individual short
    ('Kotonoha no Niwa',          2013): 'Shorts',             # Garden of Words 46 min
    ('Hotarubi no Mori e',        2011): 'Shorts',             # 45 min
    ('Blade Runner: Black Out 2022', 2017): 'Shorts',          # 15 min anime short
    ('Fantasia/2000',             1999): 'Feature Animation',
    ('Fantasia',                  1940): 'Feature Animation',
}

# ─── Animated feature films (≥ ~60 min, treated as features) ─────────────────
ANIMATED_FEATURES = {
    # Studio Ghibli
    'Sen to Chihiro no Kamikakushi',
    'Mononoke-hime',
    'Tonari no Totoro',
    'Kaze no Tani no Nausicaä',
    'Kaze tachinu',
    'Kaguyahime no monogatari',
    'Hōhokekyo Tonari no Yamada-kun',
    'Gake no ue no Ponyo',
    'Kokuriko-zaka Kara',
    'Heisei tanuki gassen pompoko',
    'Omohide Poro Poro',
    'Neko no ongaeshi',
    'Karigurashi no Arrietty',
    'Majo no Takkyūbin',
    'Lupin III: Cagliostro no Shiro',
    'Umi ga kikoeru',
    'Gedo senki',
    'Mimi wo Sumaseba',
    'Hauru no ugoku shiro',
    'Omoide no Marnie',
    'Tenkū no Shiro Laputa',
    'Kono Sekai no Katasumi ni',
    'Āya to Majo',
    # Makoto Shinkai features (≥ 63 min)
    'Kimi no Na wa.',
    'Tenki no Ko',
    'Suzume no Tojimari',
    'Kumo no Mukō, Yakusoku no Basho',
    'Byōsoku 5 Centimeter',
    # Mamoru Hosoda
    'Ōkami Kodomo no Ame to Yuki',
    'Mirai no Mirai',
    'Toki o Kakeru Shōjo',
    'Summer Wars',
    'Belle: Ryū to Sobakasu no Hime',
    # Satoshi Kon
    'Paprika',
    'Perfect Blue',
    'Manie-Manie: Meikyū Monogatari',
    'Memories',
    'Sennen Joyū',
    'Tokyo Godfathers',
    # Otomo / Rintaro
    'Akira',
    'Metropolis',
    'Suchîmubôi',
    'Short Peace',
    # Anime features
    'The Animatrix',
    'Robot Carnival',
    'Genius Party',
    'Redline',
    'Mutafukaz',
    'Kanashimi no Beradona',
    'La Planète sauvage',
    'Heavy Metal',
    'Kōkaku Kidōtai',
    'Kōkaku Kidōtai Stand Alone Complex: Solid State Society',
    'Kōkaku Kidōtai S.A.C. Solid State Society 3D',
    'Kôkaku Kidôtai',
    'Hotaru no Haka',
    'Cowboy Bebop: Tengoku no Tobira',
    'Yōjū Toshi',
    'Appleseed',
    'Kite',
    'Trigun: Badlands Rumble',
    'Shinseiki Evangelion Gekijōban: Shi to Shinsei',
    'Shin Seiki Evangelion Gekijōban: The End of Evangelion: Air/Magokoro o, Kimi ni',
    'Made in Abyss: Fukaki Tamashii no Reimei',
    'Shin Gekijō-ban Initial D Legend 1 - Kakusei',
    'Shin Gekijō-ban Initial D Legend 2 - Tōsō',
    'Hagane no Renkinjutsushi: Milos no Sei-Naru Hoshi',
    'Yoru wa Mijikashi Aruke yo Otome',
    'Sarusuberi: Miss Hokusai',
    'Yoake Tsugeru Lu no Uta',
    'Waka Okami wa Shōgakusei!',
    'Tatsumi',
    'Koe no Katachi',
    'Mary to Majo no Hana',
    'The Breadwinner',
    'O Menino e o Mundo',
    'Funan',
    'Another Day of Life',
    'Les hirondelles de Kaboul',
    'La tortue rouge',
    'Vals im Bashir',
    'Loving Vincent',
    'Persepolis',
    'Felidae',
    'The Plague Dogs',
    'Watership Down',
    'Song of the Sea',
    'Ma Vie de Courgette',
    'Ernest & Célestine',
    'Ernest et Célestine',
    'Les triplettes de Belleville',
    'Coraline',
    'Mary and Max',
    'Kurenai no buta',
    'Avril et le monde truqué',
    'Le Petit Prince',
    'Tom and Jerry: The Movie',
    'Astérix et Cléopâtre',
    "Les douze travaux d'Astérix",
    'Tekkon Kinkreet',
    'Promare',
    'Jin-Rō',
    'Kokoro ga Sakebitagatterun Da',
    'Hana to Alice Satsujin Jiken',
    'Colorful',
    'Kono Subarashii Sekai ni Shukufuku o! Kurenai Densetsu',
    'Psycho-Pass',
    'Uchiage Hanabi, Shita kara Miru ka? Yoko kara Miru ka?',
    'Kaijū no Kodomo',
    'Ginga tetsudô no yoru',
    'Toaru Hikūshi e no Tsuioku',
    'Fuse Teppō Musume no Torimonochō',
    'Macross Plus Movie Edition',
    'Kizumonogatari I: Tekketsu-hen',
    'Kizumonogatari II: Nekketsu-hen',
    'Kizumonogatari III: Reiketsu-hen',
    'Gekijōban Violet Evergarden',
    'Violet Evergarden Gaiden: Eien to Jidō Shuki Ningyō',
    'Sayonara no Asa ni Yakusoku no Hana o Kazarō',
    'Innocence',
    'Evangelion Shin Gekijōban: Jo',
    'Evangelion Shin Gekijōban: Ha',
    'Evangelion Shin Gekijō-ban Q Quickening',
    'Shin Evangelion Gekijō-ban :||',
    'Suzumiya Haruhi no Shōshitsu',
    'Fate/Stay Night: Heaven\'s Feel I. Presage Flower',
    'Fate/stay night: Heaven\'s Feel II. lost butterfly',
    'Fate/Stay night: Heaven\'s Feel III. spring song',
    'Tenshi no tamago',
    'Tout en Haut du Monde',
    'Le Tableau',
    'Josep',
    "Psiconautas, los niños olvidados",
    'Nocturna',
    'Wonderful Days',
    'Ruben Brandt, a gyűjtő',
    'Dilili à Paris',
    'Une vie de chat',
    'Wolfwalkers',
    'The Secret of Kells',
    'Batman: Mask of the Phantasm',
    'The Bugs Bunny / Road-Runner Movie',
    'Looney Tunes: Rabbits Run',
    'Animal Farm',
    'All Dogs Go to Heaven',
    'Spirit: Stallion of the Cimarron',
    'The Road to El Dorado',
    'Legend of the Guardians: The Owls of Ga\'Hoole',
    'Happy Feet',
    'Happy Feet Two',
    'Arrugas',
    'Arjun: The Warrior Prince',
    'Abominable',
    'The Prophet',
    'Over the Moon',
    'Klaus',
    'Kubo and the Two Strings',
    'The Magician\'s Elephant',
    'The Amazing Maurice',
    'The Bad Guys',
    'Ron\'s Gone Wrong',
    'DC League of Super-Pets',
    'Puss in Boots',
    'Puss in Boots: The Last Wish',
    # Disney classics
    'Snow White and the Seven Dwarfs',
    'Pinocchio',
    'Bambi',
    'Cinderella',
    'Peter Pan',
    'Lady and the Tramp',
    'Sleeping Beauty',
    'One Hundred and One Dalmatians',
    'The Jungle Book',
    'The Rescuers',
    'The Rescuers Down Under',
    'The Little Mermaid',
    'Beauty and the Beast',
    'Aladdin',
    'The Return of Jafar',
    'Pocahontas',
    'Hercules',
    'Mulan',
    'Tarzan',
    'Dinosaur',
    'The Emperor\'s New Groove',
    'Lilo & Stitch',
    'Treasure Planet',
    'Brother Bear',
    'Home on the Range',
    'Chicken Little',
    'Meet the Robinsons',
    'Bolt',
    'The Princess and the Frog',
    'Tangled',
    'Winnie the Pooh',
    'Wreck-It Ralph',
    'Frozen',
    'Big Hero 6',
    'Zootopia',
    'Moana',
    'Ralph Breaks the Internet',
    'Frozen II',
    'Raya and the Last Dragon',
    'Encanto',
    'Strange World',
    'Luca',
    'Lightyear',
    'Turning Red',
    'Dumbo',
    # Pixar
    'Toy Story',
    "A Bug's Life",
    'Toy Story 2',
    'Toy Story 3',
    'Toy Story 4',
    'Monsters, Inc.',
    'Finding Nemo',
    'Finding Dory',
    'The Incredibles',
    'Cars',
    'Cars 2',
    'Cars 3',
    'Ratatouille',
    'WALL·E',
    'Up',
    'Brave',
    'Monsters University',
    'Inside Out',
    'The Good Dinosaur',
    'Coco',
    'Incredibles 2',
    'Onward',
    'Soul',
    # DreamWorks / other
    'Antz',
    'The Prince of Egypt',
    'Chicken Run',
    'Shrek',
    'Shrek 2',
    'Shrek the Third',
    'Shrek Forever After',
    'Shark Tale',
    'Madagascar',
    "Madagascar: Escape 2 Africa",
    "Madagascar 3: Europe's Most Wanted",
    'Over the Hedge',
    'Flushed Away',
    "Surf's Up",
    'Kung Fu Panda',
    'Kung Fu Panda 2',
    'How to Train Your Dragon',
    'How to Train Your Dragon 2',
    'Thumbelina',
    'The Nightmare Before Christmas',
    'Corpse Bride',
    'Isle of Dogs',
    'Missing Link',
    'The Swan Princess',
    'Anastasia',
    'The Land Before Time',
    'Balto',
    'The Iron Giant',
    'Spider-Man: Into the Spider-Verse',
    'Spider-Man: Across the Spider-Verse',
    'The Lego Movie',
    'The Lego Batman Movie',
    'The LEGO Movie 2: The Second Part',
    'TMNT',
    'Rio',
    'Cloudy with a Chance of Meatballs',
    'Rango',
    'The Super Mario Bros. Movie',
    'James and the Giant Peach',
    'The Black Cauldron',
    'Atlantis: The Lost Empire',
    'Quest for Camelot',
    'Blinky Bill the Movie',
    'L.O.L. Surprise: The Movie',
    'The Mitchells vs. The Machines',
    'Mune, le gardien de la lune',
    'Hilda and the Mountain King',
}

# ─── Known short films ────────────────────────────────────────────────────────
SHORTS = {
    # Pixar theatrical shorts
    'Luxo Jr.',
    "Red's Dream",
    'Tin Toy',
    'Knick Knack',
    "Geri's Game",
    'For the Birds',
    "Mike's New Car",
    "Boundin'",
    'Jack-Jack Attack',
    'One-Man Band',
    'Mater and the Ghostlight',
    'Lifted',
    'Presto',
    'BURN-E',
    'Partly Cloudy',
    'Day & Night',
    'Hawaiian Vacation',
    'La Luna',
    "The Adventures of André and the Wally B.",
    'Your Friend the Rat',
    'George & A.J.',
    "Dug's Special Mission",
    "The Legend of Mor'du",
    'The Blue Umbrella',
    "Sanjay's Super Team",
    "Riley's First Date?",
    'Partysaurus Rex',
    'Party Central',
    "Miss Fritter's Racing Skoool",
    'Finding Dory: Marine Life Interviews',
    'Lou',
    'Lava',
    'Bao',
    'Piper',
    'Smash and Grab',
    'Kitbull',
    'Purl',
    'Age of Sail',
    'Pearl',
    'Quay',
    'The Pixar Shorts: A Short History',
    'Toy Story: Small Fry',
    # Pixar SparkShorts
    'Blush',
    'Burrow',
    'Out',
    'Loop',
    'Us Again',
    'Myth: A Frozen Tale',
    'Float',
    'Wind',
    '22 vs. Earth',
    'Lamp Life',
    # Pixar TV specials
    'Toy Story of Terror',
    'Toy Story of Terror!',
    'Toy Story That Time Forgot',
    'Mr. Incredible and Pals',
    # Disney shorts
    'Frozen Fever',
    'Tangled Ever After',
    'Paperman',
    'Feast',
    'Get a Horse!',
    'The Little Matchgirl',
    'Lorenzo',
    'John Henry',
    'How to Hook Up Your Home Theater',
    'The Ballad of Nessie',
    'Tick Tock Tale',
    'Prep & Landing Stocking Stuffer: Operation: Secret Santa',
    "Mickey's Christmas Carol",
    'Once Upon a Snowman',
    'Destino',
    'Super Rhino',
    'Auntie Edna',
    'Son of Jaguar',
    'Inner Workings',
    # Shinkai early shorts
    'Kanojo to Kanojo no Neko',
    'Hoshi no Koe',
    'Dareka no Manazashi',
    'Tōi Sekai',
    # Ghibli short/OVA
    'Iblard Jikan',
    'Chiisana Eiyū: Kani to Tamago to Tōmei Ningen',
    # Anime shorts/OVA
    'Violet Evergarden: Kitto "Ai" o Shiru Hi ga Kuru no Darō',
    'Cowboy Bebop PV: Don\'t Bother None',
    'Fantascope tylostoma',
    'Kyousogiga',
    "Kono Subarashī Sekai ni Shukufuku o! 2: Kono Subarashī Geijutsu ni Shukufuku o!",
    'Alien: Covenant - Prologue: The Crossing',
    # Other animated shorts
    'La jetée',
    'Att döda ett barn',
    'Puparia',
    'Goldman v Silverman',
    'Doodlebug',
    'Captain Sparky vs. The Flying Saucers',
    'Joe Pera Talks You to Sleep',
    'W sumie moglibyśmy nakręcić jakiś film',
    'Moonrise Kingdom: Animated Book Short',
    'Cousin Ben Troop Screening with Jason Schwartzman',
    'Hotel Chevalier',
    'Castello Cavalcanti',
    'My Best Friend\'s Birthday',
    'Amblin\'',
    # Don Hertzfeldt
    'Rejected',
    'Everything Will Be Ok',
    'I Am So Proud of You',
    # NFB / Canadian
    'Blind Vaysha',
    'Madame Tutli-Putli',
    'When the Day Breaks',
    'Village of Idiots',
    'The Bead Game',
    'Wild Life',
    'The Street',
    'The Danish Poet',
    'The Dingles',
    'The Cat Came Back',
    'Canada Vignettes: Log Driver\'s Waltz',
    'My Grandmother Ironed the King\'s Shirts',
    # Animated shorts - misc
    'The Metamorphosis of Mr. Samsa',
    'Big Buck Bunny',
    'Sintel',
    'Spring',
    'Cosmos Laundromat',
    'Duck Amuck',
    'The Dot and the Line: A Romance in Lower Mathematics',
    'Back to the Moon',
    'Duet',
    'Dear Basketball',
    'Special Delivery',
    'Help',
    'Buggy Night',
    'Rain or Shine',
    'Weekends',
    'Tsumiki no ie',
    'World of Tomorrow',
    'Canvas',
    'If Anything Happens I Love You',
    'Tori no Uta',
    'Protozoa',
    'Gondora',
    'REW-FFWD',
    'Next Floor',
    'Rated R for Nudity',
    '120 Seconds to Get Elected',
    # David Lynch shorts
    'The Short Films of David Lynch',
    'The Cowboy and the Frenchman',
    'The Amputee',
    'Absurd Encounter with Fear',
    'The Grandmother',
    'The Alphabet',
    'Six Figures Getting Sick',
    'What Did Jack Do?',
    # Tim Burton shorts
    'Vincent',
    'Stalk of the Celery Monster',
    # Wes Anderson shorts
    # Polish animated shorts
    'Tango',
    'Lykantropia',
    'Zbrodnia i kara',
    'Schody',
    'Czarny Kapturek',
    'Lokomotywa',
    'Blok',
    'Kreski i kropki',
    'Refleksy',
    'Wszystko jest liczbą',
    'Samogłoska',
    'Birdstrike',
    'Darkwave: Edge of the Storm',
    'Die Nashörner',
    'Fobia',
    'Dla Elizy Bagatela a-moll WoO 59',
    'Rondo Alla Turca z Sonaty A-dur KV 331',
    'Moonbird',
    'The Apple',
    'Ściany',
    'Kernseif',
    'Hessi James',
    'Das Rad',
    'Der Besuch',
    '366 Tage',
    'Wallflower Tango',
    'Citipati',
    'DragonSlayer',
    'Mobile',
    'Zing',
    'Tysiąc i jeden drobiazgów',
    'Labirynt',
    'Urs',
    'Dreammaker',
    'Lekcja nieskończoności',
    'Rain',
    'Niezwyciężeni',
    'Animowana historia Polski',
    'Smok',
    'Jaga',
    'Twardowsky',
    'Twardowsky 2.0',
    'Operacja Bazyliszek',
    'Grunwald. Walka 600-lecia',
    'Lucky Day Forever',
    'Fantascope tylostoma',
    'Esperalia',
    'Edward Psie Serce',
    'Kto wypije więcej',
    'Stara latarnia',
    'Zawodowiec',
    'Syn Gwiazd',
    'Warzywniak, 360 St.',
    'Żegnaj paro!',
    'Wyścig',
    'Libido',
    'Bankiet',
    'Wypadek',
    'Mimoza',
    'Czar kółek',
    'Tren zbója',
    'Szychta',
    'Narodziny',
    'Wiklinowy kosz',
    'Ręka',
    'Solo na ugorze',
    'Nowy Janko Muzykant',
    'Nerwowe życie kosmosu',
    'Kuszenie św. Antoniego',
    'Postrzyżyny',
    'Przygoda marynarza',
    'Strojenie instrumentów',
    'Kinematograf',
    'Apel',
    'Droga',
    'Ptak',
    'Syn',
    'Zmiana warty',
    'Podróż',
    'Sekcja zwłok',
    'Jak działa jamniczek',
    'Mały western',
    'Czerwone i czarne',
    'Klatki',
    'Ostry film zaangażowany. Non Camera',
    'Katedra',
    'Sztuka spadania',
    'Podstawy BHP w kopalni miedzi',
    # Kieslowski documentary shorts
    'Szpital',
    'Dworzec',
    'Fabryka',
    'Zdjęcie',
    'Murarz',
    'Refren',
    'Klaps',
    'Prześwietlenie',
    'Między Wrocławiem a Zieloną Górą',
    'Przed rajdem',
    'Koncert życzeń',
    'Z miasta Łodzi',
    'Tramwaj',
    'Urząd',
    'Ekonomia w praktyce',
    'Robotnicy 1971 - Nic o nas bez nas',
    'Siedem kobiet w różnym wieku',
    'Byłem żołnierzem',
    'Życiorys',
    'Personalny',
    'Gadające głowy',
    'Z punktu widzenia nocnego portiera',
    'Nie wiem',
    'Legenda',
    'Pierwsza miłość',
    'Spokój',
    'Krótki dzień pracy',
    'Gospodarze',
    # BMW The Hire films (shorts ~10-15 min)
    'The Escape',
    'Beat the Devil',
    'The Follow',
    'Chosen',
    'Ambush',
    'Powder Keg',
    'Star',
    'Ticker',
    'Hostage',
    # Animated shorts from Aug 2020 batch
    'Tuurngait',
    'Francis',
    'Alma',
    'Borrowed Time',
    'Redone',
    'Franz Kafka',
    'The Dam Keeper',
    'Mest kinematograficheskogo operatora',
    'Tumbleweed Tango',
    'Lost & Found',
    'The Lost Thing',
    'Canned',
    'Garden Party',
    'Baobab',
    'Taking the Plunge',
    "Sailor's Delight",
    'Danny Boy',
    'Piirongin piiloissa',
    'If I was God',
    'Drawn to You',
    'Electroshock',
    'Brain Divided',
    'Desire',
    'Mr. Indifferent',
    'Dia de los Muertos',
    'Spellbound',
    'In the Fall',
    'Afternoon Class',
    'The Sad Reality of Our World',
    'Moby & the Void Pacific Choir: Are You Lost in the World Like Me',
    'Where Are They Now?',
    'The Walk Home',
    'Wake Up Call',
    'Anytime Is Ice Cream Time',
    'Man',
    'Happiness',
    'Children',
    'The Maker',
    'Le Fauteuil',
    'Rubato',
    'Soar',
    'Monsterbox',
    'Can I Stay',
    'Dear Alice',
    'Bibo',
    'Selfie Cat',
    'The Colors of Evil',
    'Achoo',
    'Catch It',
    'Ice pepper',
    'The Short Story of a Fox and a Mouse',
    'Sweet Cocoon',
    'Tea Time',
    'Alarm',
    "Juste de l'eau",
    'Sonder',
    'La Boîte',
    'Negative Space',
    'Devotion',
    'Adam and Dog',
    'Two Worlds',
    "Goutte d'Or",
    'Exode',
    'Rituel',
    'Animated Guide to Polish Success',
    'Wielka ucieczka!',
    'Oh Sheep!',
    'Tolerantia',
    'Little Quentin',
    'Royal Madness',
    "Hors de l'eau",
    'Worlds Apart',
    'Goliath',
    'Little Tombstone',
    'Reaping for Dummies',
    'The Albatross',
    'The Gloaming',
    'Origami',
    'Gus',
    'Golden Shot',
    'Big Boom',
    'The Rise and Fall of Globosome',
    'Premier Automne',
    'Descendants',
    'The OceanMaker',
    'Paths of Hate',
    'Machina Mortem',
    '850 meters',
    'The Chase',
    'Le gouffre',
    'Geist',
    'Beerbug',
    'Chateau De Sable',
    'Poilus',
    'Johnny Express',
    'Ex-E.T.',
    'Watermelon: A Cautionary Tale',
    'Fox Tale',
    'Snack Attack',
    'Scrambled',
    'Print Your Guy',
    'Wedding Cake',
    'Wire Cutters',
    'Mécanique',
    'Autonomous',
    'Autonomous Soul',
    'Planet Unknown',
    'The Present',
    'Abiogenesis',
    'Ruin',
    'Jinxy Jenkins, Lucky Lou',
    'Alike',
    'Extinguished',
    'The Wishgranter',
    'Hair Love',
    'One Small Step',
    # Other known shorts
    'Anima',
    'Kung Fury',
    'Ambition',
    'Logorama',
    'Silent',
    'Ban-do',
    'Kiwi!',
    'Scooby-Doo And Mummy Too',
    'Skywatch',
    'Adumu',
    'The Wrong Rock',
    'Dimanche',
    'Hinterland',
    'Dji. Death Sails',
    'Camino de agua para un pez',
    'Le Renard et l\'Oisille',
    'Apollo',
    'Our Wonderful Nature',
    # German/misc animated shorts batch (Dec 2020)
    'Mercury Bird',
    'Racing Beats',
    'No Limits',
    'Happily Ever After',
    'Es wird Regen geben - eine Begegnung in Patagonien',
    'Kellerkind',
    'Deep Dance',
    'Loom',
    'Lebensader',
    'Kater',
    'Natural Attraction',
    # Nov 2020 animated shorts batch
    'Some Thing',
    'Child',
    'Mee',
    'Monstersymfonie',
    'Shine',
    'Night Spinning',
    'Bear Me',
    'Das Begräbnis des Harald Kramer',
    'Amour Fou',
    'Angelinho',
    'Frog Perspective',
    'Pianoid',
    # Misc
    'No Time',
    'Fortune Cookie',
    'Egao',
    'Je t\'aime',
    'Carmen Sandiego: To Steal or Not to Steal',
    # CBeebies animated TV specials (~25 min)
    'The Gruffalo',
    "The Gruffalo's Child",
    'Room on the Broom',
    'The Highway Rat',
    # 2021 Pixar shorts
    '22 vs. Earth',
    'Alien: Covenant - Prologue: The Crossing',
    'Doodlebug',
    'Vincent',
}


def get_datajs_titles(data_js_path):
    """Extract all title strings from data.js ITEMS to avoid duplicates."""
    try:
        with open(data_js_path, encoding='utf-8') as f:
            content = f.read()
        return set(re.findall(r"title:\s*'((?:[^'\\]|\\.)*)'", content))
    except Exception:
        return set()


def make_slug(title):
    """Generate a URL-safe ASCII slug from a title."""
    s = title.lower()
    s = s.encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', '-', s.strip())
    s = re.sub(r'-+', '-', s)
    return s[:60].strip('-')


def get_medium(title, year):
    key = (title, year)
    if key in YEAR_SPECIFIC:
        return YEAR_SPECIFIC[key]
    if year <= EARLY_CINEMA_YEAR:
        return 'Shorts'
    if title in ANIMATED_FEATURES:
        return 'Feature Animation'
    if title in SHORTS:
        return 'Shorts'
    return 'Movies'


def parse_rating(raw):
    r = raw.strip()
    if not r:
        return None
    try:
        v = int(float(r))
        if 1 <= v <= 10:
            return str(v)
    except Exception:
        pass
    return None


def js_escape(s):
    return s.replace('\\', '\\\\').replace("'", "\\'")


def main():
    existing = get_datajs_titles(DATA_JS)
    items = []
    seen_ids = {}   # slug → count
    skipped = 0
    total = 0

    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) < 2:
                continue
            title = row[0].strip()
            year_raw = row[1].strip()
            rating_raw = row[2].strip() if len(row) > 2 else ''

            if not title or not year_raw:
                continue
            try:
                year = int(year_raw)
            except Exception:
                continue

            total += 1

            # Skip titles already curated in data.js
            if title in existing:
                skipped += 1
                continue

            medium = get_medium(title, year)
            slug = make_slug(title)

            # Ensure unique ID
            base = f'imp-f-{slug}'
            if base not in seen_ids:
                seen_ids[base] = 1
                item_id = base
            else:
                item_id = f'{base}-{year}'
                if item_id in seen_ids:
                    item_id = f'{base}-{year}-{seen_ids[base]}'
                seen_ids[base] += 1
            seen_ids[item_id] = 1

            rating = parse_rating(rating_raw)

            parts = [
                f"id: '{js_escape(item_id)}'",
                f"title: '{js_escape(title)}'",
                f"year: {year}",
                f"medium: '{medium}'",
            ]
            if rating:
                parts.append(f"rating: '{rating}'")

            items.append('  { ' + ', '.join(parts) + ' },')

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        f.write('// AUTO-GENERATED by gen_imports_films.py — do not edit directly\n')
        f.write('window.CULTURE_FILM_IMPORTS = [\n')
        for line in items:
            f.write(line + '\n')
        f.write('];\n')

    print(f'Total CSV rows:  {total}')
    print(f'Skipped (dupes): {skipped}')
    print(f'Written:         {len(items)}')
    stats = {}
    for line in items:
        m = line.split("medium: '")[1].split("'")[0]
        stats[m] = stats.get(m, 0) + 1
    for k, v in sorted(stats.items()):
        print(f'  {k}: {v}')
    print(f'Output: {OUT_PATH}')


if __name__ == '__main__':
    main()
