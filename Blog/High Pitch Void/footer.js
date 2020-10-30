document.write('\
  \
        <script src="../../scrollreveal.js"><\/script>\
        <script src="https://cdnjs.cloudflare.com/ajax/libs/tilt.js/1.2.1/tilt.jquery.min.js"><\/script>\
\
<script>\
$(\'.col-md-3, .col-md-4, .col-md-5, .col-lg-3, .col-lg-4, .col-lg-5, .col-lg-6, .col-lg-8\').tilt({\
    glare: true,\
    maxGlare: .1,\
    transition: true\
})\
<\/script>\
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
<nav class="navbar navbar-inverse navbar-bottom footer" role="navigation">\
  <div class="navbar-header">\
  </div>\
    <div class="container-fluid">\
    <ul class="nav navbar-nav">\
  <li><a href="../../Index.html">Index</a></li>\
  <li><a href="../../Blog.html">Blogs</a></li>\
    </ul>\
\
        <ul class="nav navbar-nav navbar-right list-inline">\
        <li><a href="../../home.html"><span class="glyphicon glyphicon-home"></span> Homepage</a></li>\
      <li><a href="../../Timeline.html"><span class="glyphicon glyphicon-zoom-in"></span> Retrospection</a></li>\
      <li><a href="../../Changes.html"><span class="glyphicon glyphicon-erase"></span> Ver: 0.95 Pre-Release</a></li>\
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