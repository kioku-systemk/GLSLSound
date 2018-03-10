// starDust - shadertoy intro
// Created by Dmitry Andreev - and'2014
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// https://www.shadertoy.com/view/4sSSWz

#define SPEED           (1.7)
#define WARMUP_TIME     (2.0)

#define PATLEN          (iSampleRate * SPEED)
#define DELAY           (3.0 * PATLEN / 16.0)
#define MASTER_VOLUME   (0.75)
#define IIR_COUNT       (32)
#define DO_DELAY        (1)

#define PI              (3.1415)
#define TWOPI           (6.2832)

// Sound track data

#define PAT_BEGIN int ph = p / 4; int pl = p - 4 * ph; if (false) {}
#define PAT(idx, a,b,c,d, e,f,g,h, i,j,k,l, m,n,o,q) else if (pat==idx) { ivec4 v = ph < 2 ? (ph == 0 ? ivec4(a,b,c,d) : ivec4(e,f,g,h)) : (ph == 2 ? ivec4(i,j,k,l) : ivec4(m,n,o,q)); return pl < 2 ? (pl == 0 ? v.x : v.y) : (pl == 2 ? v.z : v.w); }
#define PAT_END return 0;

int drum_pat(int pat, int p)
{
    if (p==0 || p==4 || p==8 || p==12) return 1;
    else return 0;
}

int snare_pat(int pat, int p)
{
    if (p==4 || p==12 || p==14 || p==15) return 1;
    else return 0;
}

int bass_pat(int pat, int p)
{
    PAT_BEGIN
    PAT(0,  16,  0, 28,  0, 16,  0, 28,  0, 16,  0, 28,  0, 16,  0, 28,  0)
    PAT(1,  14,  0, 26,  0, 14,  0, 26,  0, 14,  0, 26,  0, 14,  0, 26,  0)
    PAT(2,  12,  0, 24,  0, 12,  0, 24,  0, 12,  0, 24,  0, 12,  0, 24,  0)
    PAT_END
}

int bass_seq(int p)
{
    if (p==0 || p==4 || p==8 || p==9 || p==12 || p==13) return 0;
    else if (p==1 || p==3 || p==5 || p==7) return 1;
    else return 2;
}

int lead_pat(int pat, int p)
{
    PAT_BEGIN
    PAT(0,  24, 50, 24, 24, 48, 55, 24, 48, 50, 24, 55, 50, 24, 50, 24, 48)
    PAT(1,  28, 52, 28, 28, 50, 55, 28, 50, 52, 28, 55, 52, 28, 52, 28, 50)
    PAT(2,  26, 54, 26, 26, 50, 57, 26, 50, 52, 26, 64, 55, 26, 52, 26, 50)
    PAT(3,  24, 52, 24, 24, 48, 55, 24, 48, 52, 24, 55, 52, 24, 52, 24, 48)
    PAT_END
}

int lead_seq(int p)
{
    if (p==10 || p==11 || p==14 || p==15) return 0;
    else if (p==1 || p==3 || p==5 || p==7) return 2;
    else if (p==2 || p==6) return 3;
    else return 1;
}

// Synth utilities

float note2Freq(int note)
{
    if (note == 0) return 0.0;

    return 16.35 * pow(1.059463, float(note));
}

float limit(float wave)
{
    return clamp(wave, -1.0, 1.0);
}

vec2 limit(vec2 wave)
{
    return clamp(wave, vec2(-1.0), vec2(1.0));
}

vec2 compress(vec2 wave, float env)
{
    return wave * clamp(env, 0.0, 1.0);
}

int imod(int x, int y)
{
    return x - (x / y) * y;
}

// Waveforms

float saw(float phi)
{
    return (phi - floor(phi)) * 2.0 - 1.0;
}

float square(float phi)
{
    return sin(TWOPI * phi) > 0.0 ? 1.0 : -1.0;
}

float noise(float phi)
{
    return fract(sin(phi * 0.011753) * 122.3762) * 2.0 - 1.0;
}

// Sequencer that converts global sample position into
// internal pattern positions and basic note envelopes

struct SequencerState
{
    float i;
    float q;
    int   p;
    int   seqpos;
    float env;
    float env_mv;
    float env2;
};

SequencerState initSequencer(float i)
{
    SequencerState s;

    s.i = i;
    s.q = 16.0 * fract(i / PATLEN);
    s.p = int(s.q);
    s.seqpos = int(i / PATLEN);

    // envelopes
    s.env = max(0.0, 1.0 - s.q + float(s.p));
    s.env2 = s.env * s.env;
    s.env_mv = s.env * 0.125;

    return s;
}

// Infinite impulse response (IIR) filter
//  note that this exact filter was used in all of AND 64k and 4k intros

struct Resonator
{
    float pos;
    float vel;
};

Resonator initResonator(void)
{
    Resonator r;

    r.pos = 0.0;
    r.vel = 0.0;

    return r;
}

Resonator updateResonator(Resonator r, float rfrq, float ramp, float x)
{
    float fx = cos(rfrq * TWOPI / iSampleRate);
    float fx_m = fx - 1.0;
    float fx_m3 = fx_m * fx_m * fx_m;
    float c = 2.0 - fx - fx;
    float v = (1.41 * sqrt(-fx_m3) + ramp * fx_m) / (ramp * fx_m);

    r.vel += (x - r.pos) * c;
    r.pos += r.vel;
    r.vel *= v;

    return r;
}

struct Mixer
{
    vec2  lead;
    float lead_fq;
    vec2  bass;
    vec2  hihat;
    vec2  snare;
    vec2  drum;
    vec2  crash;
};

vec2 synthWave(float i, Mixer m)
{
    vec2 wave = vec2(0.0);
    SequencerState s = initSequencer(i);

    if (s.seqpos < 32)
    {
        float phi;
        int   note;

        note = lead_pat(lead_seq(imod(s.seqpos, 16)), s.p);
        float nfrq = note2Freq(note);

        // Lead
        if (nfrq > 0.0)
        {
            Resonator r = initResonator();

            for (int n = IIR_COUNT; n >= 0; n--)
            {
                float ii = i - float(n);
                SequencerState s = initSequencer(ii);

                float phi = s.env_mv * nfrq;
                float val = sqrt(s.env) * saw(phi);
                val = limit(val * 5.0);

                float rfrq = m.lead_fq * (32.0 * s.env * phi
                    + 2900.0 + 2400.0 * cos(0.25 * PI * ii / PATLEN));

                if (s.seqpos < 4 || s.seqpos >= 31) rfrq *= 0.25;

                r = updateResonator(r, rfrq, 8.0, val);
            }

            wave = m.lead * vec2(r.pos);
            wave = limit(wave * 3.0);
        }

        // Bass
        note = bass_pat(bass_seq(imod(s.seqpos, 16)), s.p);
        if (s.seqpos >= 4 && note > 0)
        {
            wave = compress(wave, 2.5 - s.env * 2.0);

            phi = s.env * note2Freq(note) * 0.0625;
            float bass_wave = s.env * (square(phi) + square(phi * 1.001));

            wave += m.bass * vec2(bass_wave);
        }

        // Hi-hat
        if (s.seqpos >= 8)
        {
            float env = imod(s.p, 4) == 2 ?
                2.0 * sqrt(s.env) // open
                : 1.3 * s.env2 ;  // closed

            wave += m.hihat * 0.7 * env * (noise(i + 0.1) + 0.3 * sin(80.0 * i));
        }

        // Snare drum
        if (s.seqpos >= 7)
        {
            float env = pow(s.env, 0.7);

            wave += m.snare * 0.9 * env * (1.5 * noise(i) + 0.3 * sin(100.0 * i))
                * (s.seqpos >= 31 ? 1.0 : float(snare_pat(0, s.p)));
        }

        // Bass drum
        if (s.seqpos >= 4)
        {
            if (drum_pat(0, s.p) > 0 || s.seqpos >= 31)
            {
                wave = compress(wave, 1.5 - s.env * 0.8);

                wave += m.drum * (
                            sin( 50.0 * s.env + 0.33)
                    + 2.0 * sin(100.0 * s.env2)
                    + 1.6 * sin(150.0 * pow(s.env2, 32.0)));
            }
        }
    }
    else
    {
        // Crash cymbal
        float env = pow( max(0.0, 1.0 - 0.25 * ((i / PATLEN) - 32.0)), 20.0);
        i = floor(i / 4.0) * 4.0;
        wave += m.crash * env * (noise(i) + 0.3 * sin(10.0 * i));
    }

    wave = limit(wave * 0.2);

    return wave;
}

vec2 mainSound(float time)
{
    time = max(0.0, time - WARMUP_TIME);
    float i = time * iSampleRate;

    Mixer m;
    m.lead  = vec2(0.9, 0.4);
    m.lead_fq = 1.0;
    m.bass  = vec2(0.8, 1.0);
    m.hihat = vec2(0.5, 1.0);
    m.snare = vec2(1.0, 1.0);
    m.drum  = vec2(1.0, 0.9);
    m.crash = vec2(1.5, 1.5);

    vec2 wave = synthWave(i, m);

    #if DO_DELAY
    if (i >= DELAY && (i / PATLEN) < 32.0)
    {
        m.lead  = vec2(0.3, 0.6);
        m.lead_fq = 0.8;
        m.bass  = vec2(0.5, 0.2);
        m.hihat = vec2(0.8, 0.3);
        m.snare = vec2(0.3, 0.3);
        m.drum  = vec2(0.2, 0.4);
        m.crash = vec2(0.0, 0.0);

        wave += synthWave(i - DELAY, m);
    }
    #endif

    wave = limit(wave * MASTER_VOLUME);

    return wave;
}