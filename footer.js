document.write('\
  \
        <script src="scrollreveal.js"><\/script>\
\
      <script>\
window.sr = ScrollReveal({ mobile: false, reset: true });\
\
sr.reveal(\'.row\', {opacity: 0,duration:1000, mobile: true});\
sr.reveal(\'h2\', {origin:\'left\', distance: \'1000px\',duration:1500});\
sr.reveal(\'h1\', {origin:\'right\', distance: \'1000px\',duration:1500});\
sr.reveal(\'h4\', {opacity: 0,duration:1500, mobile: false});\
sr.reveal(\'h5\', {origin:\'bottom\', distance: \'1000px\',duration:1000});\
sr.reveal(\'span\', {opacity: 0,duration:1000, mobile: false});\
<\/script>\
<div class="container-fluid">\
    <div class="row">\
<nav class="navbar navbar-inverse navbar-bottom" role="navigation">\
  <div class="navbar-header">\
    <a class="navbar-brand" href="#"><ol>Future Projects:</ol></a>\
  </div>\
    <div class="container-fluid">\
    <ul class="nav navbar-nav">\
  <li><a href="Blog.html">Blogs</a></li>\
  <li><a href="noigitara.html">No i Gitara!</a></li>\
    </ul>\
\
        <ul class="nav navbar-nav navbar-right list-inline">\
        <li><a href="index.html"><span class="glyphicon glyphicon-home"></span> Homepage</a></li>\
      <li><a href="Timeline.html"><span class="glyphicon glyphicon-zoom-in"></span> Retrospection</a></li>\
      <li><a href="Changes.html"><span class="glyphicon glyphicon-erase"></span> Ver: 0.8.8 BETA</a></li>\
    </ul>\
\
</nav>\
</div>\
</div>\
</div>\
</div>\
</div>\
<script>\
sr.reveal(\'span\', {opacity: 0,duration:1000});\
<\/script>\
\
');