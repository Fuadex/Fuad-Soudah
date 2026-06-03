# gen_imports_films.ps1  —  outputs imports_films.js
# Run: powershell -ExecutionPolicy Bypass -File gen_imports_films.ps1

$root = Split-Path $MyInvocation.MyCommand.Path
$EARLY = 1916   # year <= this -> Shorts

# ── Year-specific overrides ───────────────────────────────────────────────────
$YEAR_SPEC = @{
    "9|2009"                                       = "Feature Animation"
    "9|2005"                                       = "Shorts"
    "Alice in Wonderland|2010"                     = "Movies"
    "Alice in Wonderland|1951"                     = "Feature Animation"
    "Cargo|2017"                                   = "Movies"
    "Cargo|2013"                                   = "Shorts"
    "The Lion King|1994"                           = "Feature Animation"
    "The Lion King|2019"                           = "Movies"
    "Robin Hood|1973"                              = "Feature Animation"
    "Frankenweenie|1984"                           = "Shorts"
    "Frankenweenie|2012"                           = "Feature Animation"
    "It's Such a Beautiful Day|2012"               = "Feature Animation"
    "It's Such a Beautiful Day|2011"               = "Shorts"
    "Kotonoha no Niwa|2013"                        = "Shorts"
    "Hotarubi no Mori e|2011"                      = "Shorts"
    "Blade Runner: Black Out 2022|2017"            = "Shorts"
    "Fantasia/2000|1999"                           = "Feature Animation"
    "Fantasia|1940"                                = "Feature Animation"
}

# ── Animated features (here-string, one title per line) ──────────────────────
$ANIM_RAW = @"
Sen to Chihiro no Kamikakushi
Mononoke-hime
Tonari no Totoro
Kaze no Tani no Nausicaä
Kaze tachinu
Kaguyahime no monogatari
Hōhokekyo Tonari no Yamada-kun
Gake no ue no Ponyo
Kokuriko-zaka Kara
Heisei tanuki gassen pompoko
Omohide Poro Poro
Neko no ongaeshi
Karigurashi no Arrietty
Majo no Takkyūbin
Lupin III: Cagliostro no Shiro
Umi ga kikoeru
Gedo senki
Mimi wo Sumaseba
Hauru no ugoku shiro
Omoide no Marnie
Tenkū no Shiro Laputa
Kono Sekai no Katasumi ni
Āya to Majo
Kimi no Na wa.
Tenki no Ko
Suzume no Tojimari
Kumo no Mukō, Yakusoku no Basho
Byōsoku 5 Centimeter
Ōkami Kodomo no Ame to Yuki
Mirai no Mirai
Toki o Kakeru Shōjo
Summer Wars
Belle: Ryū to Sobakasu no Hime
Paprika
Perfect Blue
Manie-Manie: Meikyū Monogatari
Memories
Sennen Joyū
Tokyo Godfathers
Akira
Metropolis
Suchîmubôi
Short Peace
The Animatrix
Robot Carnival
Genius Party
Redline
Mutafukaz
Kanashimi no Beradona
La Planète sauvage
Heavy Metal
Kōkaku Kidōtai
Kōkaku Kidōtai Stand Alone Complex: Solid State Society
Kōkaku Kidōtai S.A.C. Solid State Society 3D
Kôkaku Kidôtai
Hotaru no Haka
Cowboy Bebop: Tengoku no Tobira
Yōjū Toshi
Appleseed
Kite
Trigun: Badlands Rumble
Shinseiki Evangelion Gekijōban: Shi to Shinsei
Shin Seiki Evangelion Gekijōban: The End of Evangelion: Air/Magokoro o, Kimi ni
Made in Abyss: Fukaki Tamashii no Reimei
Shin Gekijō-ban Initial D Legend 1 - Kakusei
Shin Gekijō-ban Initial D Legend 2 - Tōsō
Hagane no Renkinjutsushi: Milos no Sei-Naru Hoshi
Yoru wa Mijikashi Aruke yo Otome
Sarusuberi: Miss Hokusai
Yoake Tsugeru Lu no Uta
Waka Okami wa Shōgakusei!
Tatsumi
Koe no Katachi
Mary to Majo no Hana
The Breadwinner
O Menino e o Mundo
Funan
Another Day of Life
Les hirondelles de Kaboul
La tortue rouge
Vals im Bashir
Loving Vincent
Persepolis
Felidae
The Plague Dogs
Watership Down
Song of the Sea
Ma Vie de Courgette
Ernest & Célestine
Ernest et Célestine
Les triplettes de Belleville
Coraline
Mary and Max
Kurenai no buta
Avril et le monde truqué
Le Petit Prince
Tom and Jerry: The Movie
Astérix et Cléopâtre
Les douze travaux d'Astérix
Tekkon Kinkreet
Promare
Jin-Rō
Kokoro ga Sakebitagatterun Da
Hana to Alice Satsujin Jiken
Colorful
Kono Subarashii Sekai ni Shukufuku o! Kurenai Densetsu
Psycho-Pass
Kaijū no Kodomo
Uchiage Hanabi, Shita kara Miru ka? Yoko kara Miru ka?
Ginga tetsudô no yoru
Toaru Hikūshi e no Tsuioku
Fuse Teppō Musume no Torimonochō
Macross Plus Movie Edition
Kizumonogatari I: Tekketsu-hen
Kizumonogatari II: Nekketsu-hen
Kizumonogatari III: Reiketsu-hen
Gekijōban Violet Evergarden
Violet Evergarden Gaiden: Eien to Jidō Shuki Ningyō
Sayonara no Asa ni Yakusoku no Hana o Kazarō
Innocence
Evangelion Shin Gekijōban: Jo
Evangelion Shin Gekijōban: Ha
Evangelion Shin Gekijō-ban Q Quickening
Shin Evangelion Gekijō-ban :||
Suzumiya Haruhi no Shōshitsu
Fate/Stay Night: Heaven's Feel I. Presage Flower
Fate/stay night: Heaven's Feel II. lost butterfly
Fate/Stay night: Heaven's Feel III. spring song
Tenshi no tamago
Tout en Haut du Monde
Le Tableau
Josep
Psiconautas, los niños olvidados
Nocturna
Wonderful Days
Ruben Brandt, a gyűjtő
Dilili à Paris
Une vie de chat
Wolfwalkers
The Secret of Kells
Batman: Mask of the Phantasm
The Bugs Bunny / Road-Runner Movie
Looney Tunes: Rabbits Run
Animal Farm
All Dogs Go to Heaven
Spirit: Stallion of the Cimarron
The Road to El Dorado
Legend of the Guardians: The Owls of Ga'Hoole
Happy Feet
Happy Feet Two
Arrugas
Arjun: The Warrior Prince
Abominable
The Prophet
Over the Moon
Klaus
Kubo and the Two Strings
The Magician's Elephant
The Amazing Maurice
The Bad Guys
Ron's Gone Wrong
DC League of Super-Pets
Puss in Boots
Puss in Boots: The Last Wish
Snow White and the Seven Dwarfs
Pinocchio
Bambi
Cinderella
Peter Pan
Lady and the Tramp
Sleeping Beauty
One Hundred and One Dalmatians
The Jungle Book
The Rescuers
The Rescuers Down Under
The Little Mermaid
Beauty and the Beast
Aladdin
The Return of Jafar
Pocahontas
Hercules
Mulan
Tarzan
Dinosaur
The Emperor's New Groove
Lilo & Stitch
Treasure Planet
Brother Bear
Home on the Range
Chicken Little
Meet the Robinsons
Bolt
The Princess and the Frog
Tangled
Winnie the Pooh
Wreck-It Ralph
Frozen
Big Hero 6
Zootopia
Moana
Ralph Breaks the Internet
Frozen II
Raya and the Last Dragon
Encanto
Strange World
Luca
Lightyear
Turning Red
Dumbo
Toy Story
A Bug's Life
Toy Story 2
Toy Story 3
Toy Story 4
Monsters, Inc.
Finding Nemo
Finding Dory
The Incredibles
Cars
Cars 2
Cars 3
Ratatouille
WALL·E
Up
Brave
Monsters University
Inside Out
The Good Dinosaur
Coco
Incredibles 2
Onward
Soul
Antz
The Prince of Egypt
Chicken Run
Shrek
Shrek 2
Shrek the Third
Shrek Forever After
Shark Tale
Madagascar
Madagascar: Escape 2 Africa
Madagascar 3: Europe's Most Wanted
Over the Hedge
Flushed Away
Surf's Up
Kung Fu Panda
Kung Fu Panda 2
How to Train Your Dragon
How to Train Your Dragon 2
Thumbelina
The Nightmare Before Christmas
Corpse Bride
Isle of Dogs
Missing Link
The Swan Princess
Anastasia
The Land Before Time
Balto
The Iron Giant
Spider-Man: Into the Spider-Verse
Spider-Man: Across the Spider-Verse
The Lego Movie
The Lego Batman Movie
The LEGO Movie 2: The Second Part
TMNT
Rio
Cloudy with a Chance of Meatballs
Rango
The Super Mario Bros. Movie
James and the Giant Peach
The Black Cauldron
Atlantis: The Lost Empire
Quest for Camelot
Blinky Bill the Movie
L.O.L. Surprise: The Movie
The Mitchells vs. The Machines
Mune, le gardien de la lune
Hilda and the Mountain King
"@

# ── Shorts (here-string) ──────────────────────────────────────────────────────
$SHRT_RAW = @"
Luxo Jr.
Red's Dream
Tin Toy
Knick Knack
Geri's Game
For the Birds
Mike's New Car
Boundin'
Jack-Jack Attack
One-Man Band
Mater and the Ghostlight
Lifted
Presto
BURN-E
Partly Cloudy
Day & Night
Hawaiian Vacation
La Luna
The Adventures of André and the Wally B.
Your Friend the Rat
George & A.J.
Dug's Special Mission
The Legend of Mor'du
The Blue Umbrella
Sanjay's Super Team
Riley's First Date?
Partysaurus Rex
Party Central
Miss Fritter's Racing Skoool
Finding Dory: Marine Life Interviews
Lou
Lava
Bao
Piper
Smash and Grab
Kitbull
Purl
Age of Sail
Pearl
Quay
The Pixar Shorts: A Short History
Toy Story: Small Fry
Blush
Burrow
Out
Loop
Us Again
Myth: A Frozen Tale
Float
Wind
22 vs. Earth
Lamp Life
Toy Story of Terror
Toy Story of Terror!
Toy Story That Time Forgot
Mr. Incredible and Pals
Frozen Fever
Tangled Ever After
Paperman
Feast
Get a Horse!
The Little Matchgirl
Lorenzo
John Henry
How to Hook Up Your Home Theater
The Ballad of Nessie
Tick Tock Tale
Prep & Landing Stocking Stuffer: Operation: Secret Santa
Mickey's Christmas Carol
Once Upon a Snowman
Destino
Super Rhino
Auntie Edna
Son of Jaguar
Inner Workings
Kanojo to Kanojo no Neko
Hoshi no Koe
Dareka no Manazashi
Tōi Sekai
Iblard Jikan
Chiisana Eiyū: Kani to Tamago to Tōmei Ningen
Violet Evergarden: Kitto "Ai" o Shiru Hi ga Kuru no Darō
Cowboy Bebop PV: Don't Bother None
Fantascope tylostoma
Kyousogiga
Kono Subarashī Sekai ni Shukufuku o! 2: Kono Subarashī Geijutsu ni Shukufuku o!
Alien: Covenant - Prologue: The Crossing
La jetée
Att döda ett barn
Puparia
Goldman v Silverman
Doodlebug
Captain Sparky vs. The Flying Saucers
Joe Pera Talks You to Sleep
W sumie moglibyśmy nakręcić jakiś film
Moonrise Kingdom: Animated Book Short
Cousin Ben Troop Screening with Jason Schwartzman
Hotel Chevalier
Castello Cavalcanti
My Best Friend's Birthday
Amblin'
Rejected
Everything Will Be Ok
I Am So Proud of You
Blind Vaysha
Madame Tutli-Putli
When the Day Breaks
Village of Idiots
The Bead Game
Wild Life
The Street
The Danish Poet
The Dingles
The Cat Came Back
Canada Vignettes: Log Driver's Waltz
My Grandmother Ironed the King's Shirts
The Metamorphosis of Mr. Samsa
Big Buck Bunny
Sintel
Spring
Cosmos Laundromat
Duck Amuck
The Dot and the Line: A Romance in Lower Mathematics
Back to the Moon
Duet
Dear Basketball
Special Delivery
Help
Buggy Night
Rain or Shine
Weekends
Tsumiki no ie
World of Tomorrow
Canvas
If Anything Happens I Love You
Tori no Uta
Protozoa
Gondora
REW-FFWD
Next Floor
Rated R for Nudity
120 Seconds to Get Elected
The Short Films of David Lynch
The Cowboy and the Frenchman
The Amputee
Absurd Encounter with Fear
The Grandmother
The Alphabet
Six Figures Getting Sick
What Did Jack Do?
Vincent
Stalk of the Celery Monster
Tango
Lykantropia
Zbrodnia i kara
Schody
Czarny Kapturek
Lokomotywa
Blok
Kreski i kropki
Refleksy
Wszystko jest liczbą
Samogłoska
Birdstrike
Darkwave: Edge of the Storm
Die Nashörner
Fobia
Dla Elizy Bagatela a-moll WoO 59
Rondo Alla Turca z Sonaty A-dur KV 331
Moonbird
The Apple
Ściany
Kernseif
Hessi James
Das Rad
Der Besuch
366 Tage
Wallflower Tango
Citipati
DragonSlayer
Mobile
Zing
Tysiąc i jeden drobiazgów
Labirynt
Urs
Dreammaker
Lekcja nieskończoności
Rain
Niezwyciężeni
Animowana historia Polski
Smok
Jaga
Twardowsky
Twardowsky 2.0
Operacja Bazyliszek
Grunwald. Walka 600-lecia
Lucky Day Forever
Esperalia
Edward Psie Serce
Kto wypije więcej
Stara latarnia
Zawodowiec
Syn Gwiazd
Warzywniak, 360 St.
Żegnaj paro!
Wyścig
Libido
Bankiet
Wypadek
Mimoza
Czar kółek
Tren zbója
Szychta
Narodziny
Wiklinowy kosz
Ręka
Solo na ugorze
Nowy Janko Muzykant
Nerwowe życie kosmosu
Kuszenie św. Antoniego
Postrzyżyny
Przygoda marynarza
Strojenie instrumentów
Kinematograf
Apel
Droga
Ptak
Syn
Zmiana warty
Podróż
Sekcja zwłok
Jak działa jamniczek
Mały western
Czerwone i czarne
Klatki
Ostry film zaangażowany. Non Camera
Katedra
Sztuka spadania
Podstawy BHP w kopalni miedzi
Szpital
Dworzec
Fabryka
Zdjęcie
Murarz
Refren
Klaps
Prześwietlenie
Między Wrocławiem a Zieloną Górą
Przed rajdem
Koncert życzeń
Z miasta Łodzi
Tramwaj
Urząd
Robotnicy 1971 - Nic o nas bez nas
Siedem kobiet w różnym wieku
Byłem żołnierzem
Życiorys
Gadające głowy
Z punktu widzenia nocnego portiera
Nie wiem
Legenda
Pierwsza miłość
Spokój
Krótki dzień pracy
Gospodarze
The Escape
Beat the Devil
The Follow
Chosen
Ambush
Powder Keg
Star
Ticker
Hostage
Tuurngait
Francis
Alma
Borrowed Time
Redone
Franz Kafka
The Dam Keeper
Mest kinematograficheskogo operatora
Tumbleweed Tango
Lost & Found
The Lost Thing
Canned
Garden Party
Baobab
Taking the Plunge
Sailor's Delight
Danny Boy
Piirongin piiloissa
If I was God
Drawn to You
Electroshock
Brain Divided
Desire
Mr. Indifferent
Dia de los Muertos
Spellbound
In the Fall
Afternoon Class
The Sad Reality of Our World
Moby & the Void Pacific Choir: Are You Lost in the World Like Me
Where Are They Now?
The Walk Home
Wake Up Call
Anytime Is Ice Cream Time
Man
Happiness
Children
The Maker
Le Fauteuil
Rubato
Soar
Monsterbox
Can I Stay
Dear Alice
Bibo
Selfie Cat
The Colors of Evil
Achoo
Catch It
Ice pepper
The Short Story of a Fox and a Mouse
Sweet Cocoon
Tea Time
Alarm
Juste de l'eau
Sonder
La Boîte
Negative Space
Devotion
Adam and Dog
Two Worlds
Goutte d'Or
Exode
Rituel
Animated Guide to Polish Success
Wielka ucieczka!
Oh Sheep!
Tolerantia
Little Quentin
Royal Madness
Hors de l'eau
Worlds Apart
Goliath
Little Tombstone
Reaping for Dummies
The Albatross
The Gloaming
Origami
Gus
Golden Shot
Big Boom
The Rise and Fall of Globosome
Premier Automne
Descendants
The OceanMaker
Paths of Hate
Machina Mortem
850 meters
The Chase
Le gouffre
Geist
Beerbug
Chateau De Sable
Poilus
Johnny Express
Ex-E.T.
Watermelon: A Cautionary Tale
Fox Tale
Snack Attack
Scrambled
Print Your Guy
Wedding Cake
Wire Cutters
Mécanique
Autonomous
Autonomous Soul
Planet Unknown
The Present
Abiogenesis
Ruin
Jinxy Jenkins, Lucky Lou
Alike
Extinguished
The Wishgranter
Hair Love
One Small Step
Anima
Kung Fury
Ambition
Logorama
Silent
Ban-do
Kiwi!
Scooby-Doo And Mummy Too
Skywatch
Adumu
The Wrong Rock
Dimanche
Hinterland
Dji. Death Sails
Camino de agua para un pez
Le Renard et l'Oisille
Apollo
Our Wonderful Nature
Mercury Bird
Racing Beats
No Limits
Happily Ever After
Es wird Regen geben - eine Begegnung in Patagonien
Kellerkind
Deep Dance
Loom
Lebensader
Kater
Natural Attraction
Some Thing
Child
Mee
Monstersymfonie
Shine
Night Spinning
Bear Me
Das Begräbnis des Harald Kramer
Amour Fou
Angelinho
Frog Perspective
Pianoid
No Time
Fortune Cookie
Egao
Je t'aime
Carmen Sandiego: To Steal or Not to Steal
The Gruffalo
The Gruffalo's Child
Room on the Broom
The Highway Rat
"@

function Parse-Set($raw) {
    $set = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $raw -split "`n" | ForEach-Object {
        $t = $_.Trim()
        if ($t) { [void]$set.Add($t) }
    }
    return $set
}
$ANIM = Parse-Set $ANIM_RAW
$SHRT = Parse-Set $SHRT_RAW

# ── Extract titles from data.js ───────────────────────────────────────────────
$dataJsContent = [System.IO.File]::ReadAllText("$root\data.js", [System.Text.Encoding]::UTF8)
$existingTitles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
[regex]::Matches($dataJsContent, "title:\s*'((?:[^'\\]|\\.)*)'") | ForEach-Object {
    [void]$existingTitles.Add($_.Groups[1].Value)
}

# ── Slug helper ───────────────────────────────────────────────────────────────
function Make-Slug([string]$title) {
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($title.ToLower())
    $s = [System.Text.Encoding]::ASCII.GetString($bytes)
    $s = [regex]::Replace($s, "[^a-z0-9 ]", " ")
    $s = [regex]::Replace($s.Trim(), "\s+", "-")
    $s = [regex]::Replace($s, "-+", "-").Trim("-")
    if ($s.Length -gt 60) { $s = $s.Substring(0, 60) }
    return $s
}

# ── Medium ────────────────────────────────────────────────────────────────────
function Get-Medium([string]$title, [int]$year) {
    $k = "$title|$year"
    if ($YEAR_SPEC.ContainsKey($k)) { return $YEAR_SPEC[$k] }
    if ($year -le $EARLY)          { return "Shorts" }
    if ($ANIM.Contains($title))    { return "Feature Animation" }
    if ($SHRT.Contains($title))    { return "Shorts" }
    return "Movies"
}

# ── JS escape ─────────────────────────────────────────────────────────────────
function JS-Esc([string]$s) {
    $s = $s.Replace("\", "\\").Replace("'", "\'")
    return $s
}

# ── Main ──────────────────────────────────────────────────────────────────────
$csvPath = "$root\Filmweb2Letterboxd_film.csv"
$outPath = "$root\imports_films.js"

$csvLines = [System.IO.File]::ReadAllLines($csvPath, [System.Text.Encoding]::UTF8)
$outLines = [System.Collections.Generic.List[string]]::new()
$seenIds  = [System.Collections.Generic.HashSet[string]]::new()
$skipped = 0; $written = 0
$cntM = 0; $cntA = 0; $cntS = 0

for ($i = 1; $i -lt $csvLines.Length; $i++) {
    $line = $csvLines[$i]
    if (-not $line.Trim()) { continue }

    # CSV parse (handle quoted fields)
    $fields = @()
    $inQ = $false; $cur = ""
    foreach ($ch in $line.ToCharArray()) {
        if ($ch -eq '"') { $inQ = -not $inQ }
        elseif ($ch -eq ',' -and -not $inQ) { $fields += $cur; $cur = "" }
        else { $cur += $ch }
    }
    $fields += $cur

    if ($fields.Count -lt 2) { continue }
    $title   = $fields[0].Trim().Trim('"')
    $yearStr = $fields[1].Trim()
    $rRaw    = if ($fields.Count -gt 2) { $fields[2].Trim() } else { "" }

    if (-not $title -or -not $yearStr) { continue }
    $year = 0
    if (-not [int]::TryParse($yearStr, [ref]$year)) { continue }

    if ($existingTitles.Contains($title)) { $skipped++; continue }

    $medium = Get-Medium $title $year
    $slug   = Make-Slug $title
    $baseId = "imp-f-$slug"
    $itemId = $baseId

    if ($seenIds.Contains($itemId)) {
        $itemId = "$baseId-$year"
        $c = 2
        while ($seenIds.Contains($itemId)) { $itemId = "$baseId-$year-$c"; $c++ }
    }
    [void]$seenIds.Add($itemId)

    $rating = ""
    if ($rRaw.Trim() -ne "") {
        $rVal = 0.0
        if ([double]::TryParse($rRaw.Trim(), [ref]$rVal)) {
            $rInt = [Math]::Round($rVal)
            if ($rInt -ge 1 -and $rInt -le 10) { $rating = "$rInt" }
        }
    }

    $tE = JS-Esc $title
    $iE = JS-Esc $itemId
    $parts = "id: '$iE', title: '$tE', year: $year, medium: '$medium'"
    if ($rating) { $parts += ", rating: '$rating'" }
    $outLines.Add("  { $parts },")

    switch ($medium) {
        "Movies"            { $cntM++ }
        "Feature Animation" { $cntA++ }
        "Shorts"            { $cntS++ }
    }
    $written++
}

$file = [System.Collections.Generic.List[string]]::new()
$file.Add("// AUTO-GENERATED by gen_imports_films.ps1 - do not edit directly")
$file.Add("window.CULTURE_FILM_IMPORTS = [")
$outLines | ForEach-Object { $file.Add($_) }
$file.Add("];")

[System.IO.File]::WriteAllLines($outPath, $file, [System.Text.UTF8Encoding]::new($false))

Write-Host "CSV rows:        $($csvLines.Length - 1)"
Write-Host "Skipped (dupes): $skipped"
Write-Host "Written:         $written"
Write-Host "  Movies:             $cntM"
Write-Host "  Feature Animation:  $cntA"
Write-Host "  Shorts:             $cntS"
Write-Host "Output: $outPath"
