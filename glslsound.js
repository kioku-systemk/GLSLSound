(function (window) {

var vsshader = (function () {
	return "attribute vec4 p;\n"+
        "void main(){\n"+
        "	gl_Position = p;\n"+
        "}";
})(),
    fsHeader = (function () {
    return "precision highp float;\n"+
        "uniform float gsTimeOffset;\n"+
        "uniform float gsSampleRate;\n"+
        "uniform float gsBufferWidth;\n"+
        "#line 1\n";
})(),
    fsFooter = (function () {
    return "void main() {\n"+
    "    float t = gsTimeOffset + ((gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * gsBufferWidth) / gsSampleRate;\n"+
    "    vec2  s = mainSound(t);\n"+
    "    vec2  w = floor((0.5 + 0.5 * s) * 65536.0);\n"+
    "    vec2 wL =   mod(w,  256.0) / 255.0;\n"+
    "    vec2 wH = floor(w / 256.0) / 255.0;\n"+
    "    gl_FragColor = vec4(wL.x, wH.x, wL.y, wH.y);\n"+
    "}\n";
})();
    

function GLSLSound() {
    this.initSound();
    this.initGL();
    this.initUniforms();
}

//---------------------------------------------------------------------------------

GLSLSound.prototype.initSound = function () {
    var AudioContext = (window.AudioContext || window.webkitAudioContext);
    if (!AudioContext) {
        alert("Don't support WebAudio");
        return null;
    }
    this.m_context = new AudioContext();   
    this.m_gainNode = this.m_context.createGain();
    this.m_gainNode.connect(this.m_context.destination);
    this.m_playNode = null;
    this.m_endCallback = null;
}

GLSLSound.prototype.initGL = function () {
    var c = document.createElement('canvas');
    c.width  = 512;
    c.height = 512;
    this.m_drawWidth  = c.width;
    this.m_drawHeight = c.height;
    
    var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) {
        alert('not support webgl');
        return;
    }
    this.gl = gl;
    //gl.viewport(0, 0, this.m_drawWidth, this.m_drawHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    //document.body.appendChild(c);
    
    // create readback buffer
    this.m_bufferSamples = this.m_drawWidth * this.m_drawHeight;
    this.m_wavedata = new Uint8Array(this.m_bufferSamples * 4);

    // create triangle
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1,1,1,-3,-3,1]), gl.STATIC_DRAW);
}

//---------------------------------------------------------------------------------

GLSLSound.prototype.compileShader = function (soundShader) {
    this.m_error = "";
    var g = this.gl;
    var fs = g.createShader(g.FRAGMENT_SHADER);
    var vs = g.createShader(g.VERTEX_SHADER);
    g.shaderSource(vs, vsshader);
    g.shaderSource(fs, fsHeader + soundShader + fsFooter);
    g.compileShader(vs);
    g.compileShader(fs);

    if (!g.getShaderParameter(fs, g.COMPILE_STATUS)) {
        this.m_error = g.getShaderInfoLog(fs); 
        console.error(this.m_error);
        return false;
    }
    this.m_prg = g.createProgram();
    g.attachShader(this.m_prg, vs);
    g.attachShader(this.m_prg, fs);
    g.linkProgram(this.m_prg);
    return true;
}

GLSLSound.prototype.getError = function () {
    return this.m_error;
}

//---------------------------------------------------------------------------------

GLSLSound.prototype.getGain = function () {
    return this.m_gainNode.gain.value;
}

GLSLSound.prototype.setGain = function (gain) {
    this.m_gainNode.gain.value = gain;
}

//---------------------------------------------------------------------------------

GLSLSound.prototype.initUniforms = function () {
    this.m_uniforms = {};
}
GLSLSound.prototype.setUniform1f = function (uniformName, value) {
    this.m_uniforms[uniformName] = [value];
}
GLSLSound.prototype.setUniform2f = function (uniformName, x, y) {
    this.m_uniforms[uniformName] = [x, y];
}
GLSLSound.prototype.setUniform3f = function (uniformName, x, y, z) {
    this.m_uniforms[uniformName] = [x, y, z];
}
GLSLSound.prototype.setUniform4f = function (uniformName, x, y, z, w) {
    this.m_uniforms[uniformName] = [x, y, z, w];
}
GLSLSound.prototype.setUniform = function (uniformName, arrayValue) {
    this.m_uniforms[uniformName] = arrayValue;
}
GLSLSound.prototype.getUniform = function (uniformName) {
    return this.m_uniforms[uniformName];
}

//---------------------------------------------------------------------------------

function setUniforms(g, prg, uniforms) {
    var u, loc, len, args, val,
        ufuncs = [null, g.uniform1f, g.uniform2f, g.uniform3f, g.uniform4f];
    for (u in uniforms) {
        if (uniforms.hasOwnProperty(u)) {
            loc = g.getUniformLocation(prg, u);
            if (loc) {
                val = uniforms[u];
                len = val.length;
                args = [loc];
                args = args.concat(val);
                ufuncs[len].apply(g, args);
            }
        }
    }
}

function drawQuad(glslSound, offset,) {
    var u,
        loc,
        val,
        g = glslSound.gl,
        prg = glslSound.m_prg;
    g.useProgram(prg);

    // set user uniforms
    setUniforms(g, prg, glslSound.m_uniforms);

    // set system uniforms
	g.uniform1f(g.getUniformLocation(prg, "gsTimeOffset"), offset);
    g.uniform1f(g.getUniformLocation(prg, "gsSampleRate"), glslSound.m_sampleRate);
    g.uniform1f(g.getUniformLocation(prg, "gsBufferWidth"), glslSound.m_drawWidth);

    // draw
	g.enableVertexAttribArray(0);
	g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
	g.drawArrays(g.TRIANGLES, 0, 3);
}


GLSLSound.prototype.prepare = function (playTimeSec, playOffsetTimeSec = 0.0) {
    if (!this.gl || !this.m_context || !playTimeSec) {
        return false;
    }

    this.m_sampleRate = 44100;
    this.m_playTime = playTimeSec;
    this.m_playSamples = this.m_playTime * this.m_sampleRate;
    this.m_buffer = this.m_context.createBuffer(2, this.m_playSamples, this.m_sampleRate );
     
    var i,
        j,
        numSamples = this.m_bufferSamples,
        bufL = this.m_buffer.getChannelData(0),
        bufR = this.m_buffer.getChannelData(1),
        numBlocks = this.m_playSamples / numSamples;
    for (i = 0; i < numBlocks; ++i )
    {
        var offset = i * numSamples;
        
        // make GLSL sound
        drawQuad(this, offset / this.m_sampleRate + playOffsetTimeSec);

        // get sound from GPU
        this.gl.readPixels(0, 0, this.m_drawWidth, this.m_drawHeight, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.m_wavedata);
        //console.log(this.m_wavedata);

        for (j = 0; j < numSamples; ++j )
        {
            bufL[offset + j] = -1.0 + 2.0 * (this.m_wavedata[4 * j + 0] + 256.0 * this.m_wavedata[4 * j + 1]) / 65535.0;
            bufR[offset + j] = -1.0 + 2.0 * (this.m_wavedata[4 * j + 2] + 256.0 * this.m_wavedata[4 * j + 3]) / 65535.0;
        }
    }
    return true;
}

//---------------------------------------------------------------------------------

GLSLSound.prototype.play = function (startOffsetSec = 0) {
    if (!this.gl || !this.m_context) {
        return false;
    }

    this.stop();
    
    this.m_playNode = this.m_context.createBufferSource();
    this.m_playNode.onended = this.m_endCallback;
    this.m_playNode.buffer = this.m_buffer;
    this.m_playNode.connect(this.m_gainNode);
    this.m_playNode.state = this.m_playNode.noteOn;
    this.m_playNode.start(0, startOffsetSec);

    return true;
}

GLSLSound.prototype.stop = function () {
    if (!this.gl || !this.m_context) {
        return false;
    }

    if (this.m_playNode != null) {
        this.m_playNode.disconnect();
        this.m_playNode.stop();
        this.m_playNode = null;
    }
    return true;
}

GLSLSound.prototype.setEndCallback = function (func) {
    this.m_endCallback = func;
}

window.GLSLSound = GLSLSound;

})(window);