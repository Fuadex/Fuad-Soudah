function doResize() {
    // FONT SIZE
    var ww = $('body').width();
    var maxW = [16384];
    ww = Math.min(ww, maxW);
    var fw = ww*(10/maxW);
    var fpc = fw*100/16;
    var fpc = Math.round(fpc*100)/100;
    $('html').css('font-size',fpc+'%');
}

document.write('\
\
<nav class="navbar navbar-inverse navbar-static-top" role="navigation">\
    <div class="navbar-header">\
      <button type="button" class="navbar-toggle" data-toggle="collapse" data-target="#myNavbar">\
        <span class="icon-bar"></span>\
        <span class="icon-bar"></span>\
        <span class="icon-bar"></span>\
      </button>\
    </div>\
    <div class="collapse navbar-collapse" id="myNavbar">\
    <ul class="nav navbar-nav">\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Artworks\
        <ul class="dropdown-menu">\
          <li><a href="Martinstag.html">Martinstag</a></li>\
          <li><a href="3D Modelling.html">ChessBox</a></li>\
          <li><a href="Visual Communication.html">Sustain</a></li>\
          <li><a href="Politics.html">Election</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Blog\
        <ul class="dropdown-menu">\
          <li><a href="Blog.html">High Pitch Void</a></li>\
          <li><a href="Grasausschuss.html">Grasausschuss</a></li>\
          <li><a href="Sehnsucht.html">Sehnsucht</a></li>\
          <li><a href="Radio.html">Radio X</a></li>\
          <li><a href="Australian Dream.html">Australian Dream</a></li>\
          <li><a href="Another Series.html">Another Series</a></li>\
          <li><a href="O wszystkim i o niczym.html">O Wszystkim i O Niczym</a></li>\
          <li><a href="http://fuadexsite.blogspot.de/">Strona Glowna</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">UX\
        <ul class="dropdown-menu">\
          <li><a href="UX.html">Museum of Contemporary Art</a></li>\
          <li><a href="Design Thinking.html">Dance at Campus</a></li>\
          <li><a href="Projekt Piaseczno.html">Project Piaseczno</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">VR\
        <ul class="dropdown-menu">\
          <li><a href="GradShow.html">Graduation Show (2017)</a></li>\
          <li><a href="Lone Island.html">Lone Island</a></li>\
          <li><a href="Trouble Cruise.html">Trouble Cruise</a></li>\
          <li><a href="VE Shopping.html">VE Shopping</a></li>\
          <li><a href="Game Concept.html">Platform 21</a></li>\
          <li><a href="Games and Play.html">Game Analysis</a></li>\
          <li><a href="Digital Arts.html">Digital Arts</a></li>\
      </ul>\
            \
        </li>\
              <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">HCI\
        <ul class="dropdown-menu">\
          <li><a href="keto.html">Keto</a></li>\
          <li><a href="BoomBox.html">Boombox</a></li>\
          <li><a href="HCI2 Mob.html">Smartwatch</a></li>\
          <li><a href="Databases.html">Postgresql Database</a></li>\
          <li><a href="Physical.html">Walkmate</a></li>\
          <li><a href="EventLocator.html">Event Locator</a></li>\
          <li><a href="Processing.html">Processing Projects</a></li>\
      </ul>\
      \
      </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Web\
        <ul class="dropdown-menu">\
          <li><a href="https://fuadex.github.io/Fuad-Soudah/">Fuad</a></li>\
          <li><a href="HCI2 Web.html">LMU</a></li>\
          <li><a href="Web Design & Technologies.html">Virgin Airlines</a></li>\
          <li><a href="Fuadex 6.0.html">First</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Videos\
        <ul class="dropdown-menu">\
          <li><a href="Vivid.html">Vivid - Projection Mapping</a></li>\
          <li><a href="MusicVideos.html">Mashups</a></li>\
          <li><a href="Untitled 360.html">Untitled 360</a></li>\
      </ul>\
            \
        </li>\
                    <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Photography\
        <ul class="dropdown-menu">\
          <li><a href="Photos.html">Flickr</a></li>\
          <li><a href="Grasausschuss Pho.html">Grasausschuss</a></li>\
          <li><a href="Instagram.html">Instagram</a></li>\
      </ul>\
            \
        </li>\
      \
    </ul>\
\
        <ul class="nav navbar-nav navbar-right list-inline">\
      <li><a href="Culture 2.html"><span class="glyphicon glyphicon-heart"></span> Culture</a></li>\
      <li><a href="Education.html"><span class="glyphicon glyphicon-education"></span> Education</a></li>\
      <li><a href="Contact.html"><span class="glyphicon glyphicon-envelope"></span> Contact</a></li>\
      <li><a href="index - Copy.html"><span class="glyphicon glyphicon-qrcode"></span> About Me</a></li>\
    </ul>\
\
</nav>\
</div>\
<div id="top"></div>\
');