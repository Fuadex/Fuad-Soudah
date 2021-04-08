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
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Graphic\
        <ul class="dropdown-menu">\
          <li><a href="Martinstag.html">Martinstag</a></li>\
          <li><a href="3D Modelling.html">Chess Box</a></li>\
          <li><a href="Visual Communication.html">Sustain</a></li>\
          <li><a href="Politics.html">Election</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Blog\
        <ul class="dropdown-menu">\
        <li><a href="Blog.html">Dreams</a></li>\
          <li><a href="RadioX.html">Radio</a></li>\
                    <li><a href="Grasausschuss.html">Gras</a></li>\
      </ul>\
      \
              </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">VFX\
        <ul class="dropdown-menu">\
          <li><a href="VFX.html">VFX/CG</a></li>\
          <li><a href="ALA.html">ALA</a></li>\
          <li><a href="Mocap.html">Mocap</a></li>\
          <li><a href="Unity.html">Reflection</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">UX\
        <ul class="dropdown-menu">\
        <li><a href="DE.html">UX Curriculum</a></li>\
          <li><a href="Placemaking.html">Leaf</a></li>\
          <li><a href="UX.html">Museum of Contemporary Art</a></li>\
          <li><a href="Design Thinking.html">Dance at Campus</a></li>\
          <li><a href="Projekt Piaseczno.html">Project Piaseczno</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">XR\
        <ul class="dropdown-menu">\
          <li><a href="AT.html">AT</a></li>\
          <li><a href="Tech.html">Placeholder</a></li>\
          <li><a href="Ed.html">Blussion</a></li>\
          <li><a href="NewMediaAudiences.html">NMA (Essays)</a></li>\
          <li><a href="GradShow.html">Graduation Show (2017)</a></li>\
          <li><a href="Lone Island.html">Lone Island</a></li>\
          <li><a href="Trouble Cruise.html">Trouble Cruise</a></li>\
          <li><a href="VE Shopping.html">Shopping</a></li>\
          <li><a href="Game Concept.html">Platform 21</a></li>\
          <li><a href="Games and Play.html">Game Analysis</a></li>\
          <li><a href="Digital Arts.html">Digital Arts</a></li>\
      </ul>\
            \
        </li>\
              <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">HCI\
        <ul class="dropdown-menu">\
        <li><a href="Safaris.html">Safaris</a></li>\
          <li><a href="Tracking.html">Savant</a></li>\
          <li><a href="keto.html">Keto</a></li>\
          <li><a href="LMS.html">Collaborative LMS</a></li>\
          <li><a href="BoomBox.html">Boombox</a></li>\
          <li><a href="HCI2 Mob.html">Smartwatch</a></li>\
          <li><a href="Databases.html">Postgresql Database</a></li>\
          <li><a href="Physical.html">Walkmate</a></li>\
          <li><a href="EventLocator.html">Event Locator</a></li>\
          <li><a href="Processing.html">Processing</a></li>\
      </ul>\
      \
      </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Web\
        <ul class="dropdown-menu">\
          <li><a href="noigitara.html">No i Gitara!</a></li>\
          <li><a href="Fuad.html">Fuad</a></li>\
          <li><a href="HCI2 Web.html">LMU</a></li>\
          <li><a href="Web Design & Technologies.html">Virgin Airlines</a></li>\
          <li><a href="Fuadex 6.0.html">First</a></li>\
      </ul>\
            \
        </li>\
      <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Video\
        <ul class="dropdown-menu">\
          <li><a href="Vivid.html">Vivid Sydney (2015)</a></li>\
          <li><a href="MusicVideos.html">Mashups</a></li>\
          <li><a href="Untitled 360.html">Untitled 360</a></li>\
      </ul>\
            \
        </li>\
                    <li class="dropdown">\
        <a class="dropdown-toggle" data-toggle="dropdown" href="#">Photo\
        <ul class="dropdown-menu">\
          <li><a href="Photos.html">Flickr</a></li>\
          <li><a href="Grasausschuss Pho.html">Grasausschuss</a></li>\
          <li><a href="Instagram.html">Snapshots</a></li>\
      </ul>\
            \
        </li>\
      \
    </ul>\
\
        <ul class="nav navbar-nav navbar-right list-inline">\
      <li><a href="Culture.html"><span class="glyphicon glyphicon-heart"></span> Culture</a></li>\
      <li><a href="Accolades.html"><span class="glyphicon glyphicon-check"></span> Accolades</a></li>\
      <li><a href="Education.html"><span class="glyphicon glyphicon-education"></span> Education</a></li>\
      <li><a href="index - Copy.html"><span class="glyphicon glyphicon-qrcode"></span> About Me</a></li>\
    </ul>\
\
</nav>\
</div>\
<div id="top"></div>\
');