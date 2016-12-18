(function (window) {

var vsshader = (function () {
	return "attribute vec4 p;\n"+
        "void main(){\n"+
        "	gl_Position = p;\n"+
        "}";
})(),
    fsHeader = (function () {
    return "precision highp float;\n"+
        "uniform float timeOffset;\n"+
        "uniform float sampleRate;\n"+
        "uniform float bufferWidth;\n"+
        "#line 1\n";
})(),
    fsFooter = (function () {
    return "void main() {\n"+
    "    float t = timeOffset + ((gl_FragCoord.x - 0.5) + (gl_FragCoord.y - 0.5) * bufferWidth) / sampleRate;\n"+
    "    vec2  s = mainSound(t);\n"+
    "    vec2  w = floor((0.5 + 0.5 * s) * 65535.0);\n"+
    "    vec2 wL =   mod(w,  256.0)  / 255.0;\n"+
    "    vec2 wH = floor(w / 256.0) / 255.0;\n"+
    "    gl_FragColor = vec4(wL.x, wH.x, wL.y, wH.y);\n"+
    "}\n";
})();
    

function GLSLSound(bufferTimeSec) {
    this.initSound(bufferTimeSec);
    this.initGL();
}

GLSLSound.prototype.initSound = function (bufferTimeSec) {
    var AudioContext = (window.AudioContext || window.webkitAudioContext);
    if (!AudioContext) {
        alert("Don't support WebAudio");
        return null;
    }
    this.m_context = new AudioContext();
    this.m_sampleRate = 44100;
    this.m_playTime = bufferTimeSec;
    this.m_playSamples = this.m_playTime * this.m_sampleRate;
    this.m_buffer = this.m_context.createBuffer(2, this.m_playSamples, this.m_sampleRate );    
    this.m_gainNode = this.m_context.createGain();
    this.m_gainNode.connect(this.m_context.destination);
    this.m_playNode = null;
}

GLSLSound.prototype.initGL = function () {
    var c = document.createElement('canvas');
    c.width  = 256;
    c.height = 256;
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

GLSLSound.prototype.compleShader = function (soundShader) {
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

GLSLSound.prototype.getGain = function () {
    return this.m_gainNode.gain.value;
}

GLSLSound.prototype.setGain = function (gain) {
    this.m_gainNode.gain.value = gain;
}

GLSLSound.prototype.drawQuad = function (offset) {
    var g = this.gl;
    g.useProgram(this.m_prg);
	g.uniform1f(g.getUniformLocation(this.m_prg, "timeOffset"), offset);
    g.uniform1f(g.getUniformLocation(this.m_prg, "sampleRate"), this.m_sampleRate);
    g.uniform1f(g.getUniformLocation(this.m_prg, "bufferWidth"), this.m_drawWidth);
	g.enableVertexAttribArray(0);
	g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
	g.drawArrays(g.TRIANGLES, 0, 3);
}


GLSLSound.prototype.prepare = function () {
    if (!this.gl || !this.m_context) {
        return false;
    }
    var i,
        j,
        numSamples = this.m_bufferSamples,
        bufL = this.m_buffer.getChannelData(0),
        bufR = this.m_buffer.getChannelData(1),
        numBlocks = this.m_playSamples / numSamples;
    for ( i = 0; i < numBlocks; ++i )
    {
        var offset = i * numSamples;
        
        // make GLSL sound
        this.drawQuad(offset, numSamples);

        // get sound from GPU
        this.gl.readPixels(0, 0, this.m_drawWidth, this.m_drawHeight, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.m_wavedata);
        //console.log(this.m_wavedata);

        for ( j = 0; j < numSamples; ++j )
        {
            bufL[offset+j] = -1.0 + 2.0 * (this.m_wavedata[4 * j + 0] + 256.0 * this.m_wavedata[4 * j + 1]) / 65535.0;
            bufR[offset+j] = -1.0 + 2.0 * (this.m_wavedata[4 * j + 2] + 256.0 * this.m_wavedata[4 * j + 3]) / 65535.0;
        }
    }
    return true;
}

GLSLSound.prototype.play = function () {

    if ( this.m_playNode != null ) {
        this.m_playNode.disconnect();
        this.m_playNode.stop();
    }

    this.m_playNode = this.m_context.createBufferSource();
    this.m_playNode.buffer = this.m_buffer;
    this.m_playNode.connect(this.m_gainNode);
    this.m_playNode.state = this.m_playNode.noteOn;
    this.m_playNode.start(0);
}

window.GLSLSound = GLSLSound;

})(window);