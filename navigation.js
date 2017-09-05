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
<div class="wrapper">\
<div class="wrapper">\
<div class="wrapper">\
<div class="container-fluid">\
    <div class="row">\
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
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Graphic Design\
        <ul class="dropdown-menu">\
          <li><a href="Martinstag.html">Martinstag</a></li>\
          <li><a href="3D Modelling.html">ChessBox</a></li>\
          <li><a href="Visual Communication.html">Sustain Logo</a></li>\
          <li><a href="Politics.html">Political Works</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Photography\
        <ul class="dropdown-menu">\
          <li><a href="Photos.html">Overview</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Videos\
        <ul class="dropdown-menu">\
          <li><a href="Vivid.html">Projection Mapping (Vivid 2015)</a></li>\
          <li><a href="MusicVideos.html">Music Videos</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Blog\
        <ul class="dropdown-menu">\
          <li><a href="Sehnsucht.html">Sehnsucht</a></li>\
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
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Web\
        <ul class="dropdown-menu">\
          <li><a href="https://fuadex.github.io/Fuad-Soudah/">New Personal Website</a></li>\
          <li><a href="HCI2 Web.html">LMU</a></li>\
          <li><a href="Web Design & Technologies.html">Virgin Airlines</a></li>\
          <li><a href="Fuadex 6.0.html">Old Personal Website</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Physical\
        <ul class="dropdown-menu">\
          <li><a href="BoomBox.html">Boombox</a></li>\
          <li><a href="HCI2 Mob.html">Smartwatch</a></li>\
          <li><a href="Physical.html">Medical</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Programming\
        <ul class="dropdown-menu">\
          <li><a href="EventLocator.html">Event Locator</a></li>\
          <li><a href="Processing.html">Processing Projects</a></li>\
      </ul>\
\
            <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Game Design\
        <ul class="dropdown-menu">\
          <li><a href="Game Concept.html">Serious Game Concept</a></li>\
          <li><a href="Games and Play.html">Video Essay</a></li>\
          <li><a href="Narrative Architecture.html">Narrative Architecture</a></li>\
          <li><a href="Digital Arts.html">Digital Arts</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Special\
        <ul class="dropdown-menu">\
          <li><a href="Projekt Piaseczno.html">Project Piaseczno</a></li>\
          <li><a href="Radio.html">Radio</a></li>\
          <li><a href="#">Postgresql Database</a></li>\
          <li><a href="Grasausschuss.html">Grasausschuss</a></li>\
      </ul>\
            \
        </li>\
    </ul>\
\
        <ul class="nav navbar-nav navbar-right list-inline">\
      <li><a href="Culture 2.html"><span class="glyphicon glyphicon-heart"></span> Culture</a></li>\
      <li><a href="Education.html"><span class="glyphicon glyphicon-education"></span> Education</a></li>\
      <li><a href="Contact.html"><span class="glyphicon glyphicon-envelope"></span> Contact</a></li>\
    </ul>\
\
</nav>\
</div>\
</div>\
<div id="top"></div>\
');