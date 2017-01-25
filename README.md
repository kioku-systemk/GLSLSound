# GLSLSound
GLSL sound framework

## Usage

    <html>
        <head>
            <script src="glslsound.js"></script>
            <script>
            var soundShader = "vec2 mainSound(float time){ return vec2( sin(6.2831 * 440.0 * time) * exp(-3.0 * time) );}";
            window.onload = function () {
                sound = new GLSLSound();
                sound.compleShader(soundShader);
                sound.prepare(3.0);
                sound.play();
            }
            </script>
        </head>
    <body>
    </body>
    </html>