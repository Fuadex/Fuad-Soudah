// WebGL fluid distortion — attaches to img.zwei inside a.darken links
(function () {
    'use strict';

    var VERT = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';

    var SIM_FRAG = [
        'precision highp float;',
        'uniform sampler2D tS;uniform vec2 uM,uP;uniform float uA;varying vec2 v;',
        'void main(){',
        '  float px=1./256.;',
        '  vec2 c=texture2D(tS,v).rg,',
        '       n=texture2D(tS,v+vec2(0.,px)).rg,',
        '       s=texture2D(tS,v-vec2(0.,px)).rg,',
        '       e=texture2D(tS,v+vec2(px,0.)).rg,',
        '       w=texture2D(tS,v-vec2(px,0.)).rg;',
        '  vec2 st=c*.5+(n+s+e+w)*.125;',
        '  st*=.975;',
        '  vec2 d=uM-uP,diff=v-uM;diff.x*=uA;',
        '  st+=d*exp(-dot(diff,diff)*55.)*12.;',
        '  gl_FragColor=vec4(st,0.,1.);',
        '}'
    ].join('');

    var DRAW_FRAG = [
        'precision highp float;',
        'uniform sampler2D tI,tS;varying vec2 v;',
        'void main(){',
        '  vec2 d=texture2D(tS,v).rg*.08;',
        '  gl_FragColor=texture2D(tI,clamp(v+d,0.,1.));',
        '}'
    ].join('');

    var SIM_SIZE = 256;

    function mkShader(gl, type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
    }
    function mkProg(gl, vs, fs) {
        var p = gl.createProgram();
        gl.attachShader(p, mkShader(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, mkShader(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        return p;
    }
    function mkFBO(gl, type) {
        var t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIM_SIZE, SIM_SIZE, 0, gl.RGBA, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { t: t, f: f };
    }

    function attach(imgEl) {
        var link = imgEl.closest('a.darken');
        if (!link) return;

        // All state lives here; WebGL is created lazily on first hover
        var canvas = null, gl = null;
        var fbos, simProg, drawProg, quad, iTex, ping = 0;
        var imgReady = false;
        var mouse = [0.5, 0.5], prev = [0.5, 0.5];
        var active = false, lastActive = 0, raf = null;
        var initialized = false, failed = false;

        function initGL() {
            initialized = true;

            canvas = document.createElement('canvas');
            // Fixed in <body> — bypasses the collapsed inline <a> containing-block problem
            // and stays clear of Swiper's transformed .swiper-wrapper ancestor
            canvas.style.cssText = 'position:fixed;pointer-events:none;opacity:0;transition:opacity .4s;z-index:9000;';
            document.body.appendChild(canvas);

            gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) { canvas.remove(); canvas = null; failed = true; return; }

            var floatExt = gl.getExtension('OES_texture_float');
            if (!floatExt) { canvas.remove(); canvas = null; failed = true; return; }
            gl.getExtension('OES_texture_float_linear');

            simProg = mkProg(gl, VERT, SIM_FRAG);
            drawProg = mkProg(gl, VERT, DRAW_FRAG);

            quad = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

            fbos = [mkFBO(gl, gl.FLOAT), mkFBO(gl, gl.FLOAT)];

            iTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, iTex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            function upload(src) {
                gl.bindTexture(gl.TEXTURE_2D, iTex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                imgReady = true;
            }

            function tryLoad() {
                // Try the existing img element directly — works for same-origin with no extra request
                try {
                    upload(imgEl);
                } catch (e) {
                    // CORS-tainted: reload with crossOrigin so WebGL can read it
                    var p = new Image();
                    p.crossOrigin = 'anonymous';
                    p.onload = function () { upload(p); };
                    p.onerror = function () { canvas.remove(); canvas = null; failed = true; };
                    p.src = imgEl.src;
                }
            }

            if (imgEl.complete && imgEl.naturalWidth > 0) {
                tryLoad();
            } else {
                imgEl.addEventListener('load', tryLoad, { once: true });
            }
        }

        // Sync canvas position + internal resolution to where the img actually is on screen
        function syncCanvas() {
            var r = imgEl.getBoundingClientRect();
            if (!r.width || !r.height) return;
            canvas.style.left   = r.left + 'px';
            canvas.style.top    = r.top  + 'px';
            canvas.style.width  = r.width  + 'px';
            canvas.style.height = r.height + 'px';
            var dpr = window.devicePixelRatio || 1;
            var w = Math.max(1, r.width  * dpr | 0);
            var h = Math.max(1, r.height * dpr | 0);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width  = w;
                canvas.height = h;
            }
        }

        function setAttr(prog) {
            var loc = gl.getAttribLocation(prog, 'a');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        }

        function frame() {
            if (!canvas) return;
            if (!imgReady) { raf = requestAnimationFrame(frame); return; }

            // First ready frame — swap visibility
            if (active && canvas.style.opacity === '0') {
                syncCanvas();
                canvas.style.opacity = '1';
                imgEl.style.opacity  = '0';
            }

            // Linger: keep running until effect decays, then clean up
            if (!active && Date.now() - lastActive > 3500) {
                canvas.style.opacity = '0';
                imgEl.style.opacity  = '';
                raf = null;
                return;
            }

            syncCanvas();
            var asp = canvas.offsetWidth / (canvas.offsetHeight || 1);

            // Simulation pass
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1 - ping].f);
            gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
            gl.useProgram(simProg);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            setAttr(simProg);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, fbos[ping].t);
            gl.uniform1i(gl.getUniformLocation(simProg, 'tS'), 0);
            gl.uniform2f(gl.getUniformLocation(simProg, 'uM'), mouse[0], mouse[1]);
            gl.uniform2f(gl.getUniformLocation(simProg, 'uP'), prev[0],  prev[1]);
            gl.uniform1f(gl.getUniformLocation(simProg, 'uA'), asp);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            ping = 1 - ping;

            // Display pass
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.useProgram(drawProg);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            setAttr(drawProg);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, iTex);
            gl.uniform1i(gl.getUniformLocation(drawProg, 'tI'), 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, fbos[ping].t);
            gl.uniform1i(gl.getUniformLocation(drawProg, 'tS'), 1);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            prev[0] = mouse[0]; prev[1] = mouse[1];
            raf = requestAnimationFrame(frame);
        }

        link.addEventListener('mouseenter', function () {
            if (failed) return;
            if (!initialized) initGL();
            if (!canvas) return;
            active = true;
            lastActive = Date.now();
            if (imgReady) {
                syncCanvas();
                canvas.style.opacity = '1';
                imgEl.style.opacity  = '0';
            }
            if (!raf) frame();
        });

        link.addEventListener('mousemove', function (e) {
            if (!canvas) return;
            var r = canvas.getBoundingClientRect();
            if (!r.width || !r.height) return;
            mouse[0] = (e.clientX - r.left) / r.width;
            mouse[1] = 1.0 - (e.clientY - r.top) / r.height;
            lastActive = Date.now();
        });

        link.addEventListener('mouseleave', function () {
            active = false;
            lastActive = Date.now();
        });
    }

    function init() {
        document.querySelectorAll('img.zwei').forEach(attach);
    }

    if (document.readyState === 'complete') { init(); }
    else { window.addEventListener('load', init); }
}());
