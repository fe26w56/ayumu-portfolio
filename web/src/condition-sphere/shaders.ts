export const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uDeformation;
uniform float uScale;
uniform float uAccentStrength;
uniform float uLightMode;
uniform vec4 uMetricScores;
uniform vec4 uMetricCompleteness;
uniform vec3 uAccentSleep;
uniform vec3 uAccentRecovery;
uniform vec3 uAccentActivity;
uniform vec3 uAccentCirculation;

mat2 rotate(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float field(vec3 p, float t) {
  return p.y + 0.50 * sin(3.5 * p.x + 1.2 * sin(p.z * 2.7) + t)
    + 0.24 * sin(5.0 * p.z - 1.3 * p.x - t * 0.7);
}

float lobe(vec3 p, vec3 center) {
  return pow(max(0.0, dot(p, center)), 3.2);
}

float angularLobe(vec2 p, vec2 center) {
  return pow(max(0.0, dot(p, center)), 3.0);
}

void main() {
  vec2 xy = (vUv - 0.5) * 2.0;
  xy.x *= uResolution.x / max(1.0, uResolution.y);
  xy /= uScale;

  float t = uTime * 0.58;
  float angle = atan(xy.y, xy.x);
  vec2 radial = length(xy) > 0.0001 ? normalize(xy) : vec2(0.0, 1.0);
  vec4 screenRegions = vec4(
    0.22 + angularLobe(radial, normalize(vec2(-0.62, 0.42))),
    0.22 + angularLobe(radial, normalize(vec2(0.64, 0.30))),
    0.22 + angularLobe(radial, normalize(vec2(-0.46, -0.54))),
    0.22 + angularLobe(radial, normalize(vec2(0.52, -0.50)))
  );
  screenRegions /= max(dot(screenRegions, vec4(1.0)), 0.001);
  vec4 metricScores = clamp(uMetricScores, 0.0, 1.0);
  vec4 metricCompleteness = clamp(uMetricCompleteness, 0.0, 1.0);
  vec4 vitality = smoothstep(vec4(0.28), vec4(0.78), metricScores);
  vec4 highVitality = smoothstep(vec4(0.78), vec4(0.98), metricScores);
  vec4 scoreDelta = metricCompleteness * (metricScores - vec4(0.5));
  float localShape = dot(screenRegions, scoreDelta);
  float localMotion = dot(screenRegions, mix(
    vec4(0.80),
    vec4(0.80) + metricScores * 0.20,
    metricCompleteness
  ));
  float radius = 1.0 + uDeformation * (
    0.018 * sin(angle * 3.0 + t * 1.7)
    + 0.011 * sin(angle * 5.0 - t)
    // A small signed offset makes each supplied metric alter its own broad
    // lobe's contour. The bounded amplitude is large enough to compare the
    // presets while keeping the membrane recognisably spherical.
    + 0.18 * localShape
  );
  float r = length(xy) / radius;
  float px = 2.0 / max(1.0, uResolution.y) / uScale;
  float mask = 1.0 - smoothstep(1.0 - px, 1.0 + px, r);

  if (mask <= 0.0) {
    gl_FragColor = vec4(vec3(uLightMode), 1.0);
    return;
  }

  float z = sqrt(max(0.0, 1.0 - r * r));
  vec2 safeXY = r > 0.0001 ? xy / radius : vec2(0.0);
  vec3 n = normalize(vec3(safeXY, z));
  vec3 p = n;
  p.xz = rotate(t * 0.85 + 1.6) * p.xz;
  p.xy = rotate(0.85 + 0.24 * sin(t * 0.6)) * p.xy;

  // Scores also affect local phase, so a single metric changes movement in its
  // lobe rather than only changing the whole sphere's global speed.
  float f = field(p, t * localMotion);
  float localDefinition = 0.72 + dot(screenRegions, metricScores) * 0.55;
  float varyingWidth = (0.004 + 0.011 * pow(0.5 + 0.5 * sin(p.x * 4.0 - p.z * 3.0 + t), 3.0)) * localDefinition;
  float aa = max(fwidth(f), 0.0015);
  float line = 1.0 - smoothstep(varyingWidth, varyingWidth + aa, abs(f));
  float companion = 1.0 - smoothstep(0.002, 0.002 + aa, abs(f - 0.048 - 0.025 * sin(p.z * 4.0 + t)));
  float glow = exp(-abs(f) * 90.0) * 0.035;
  float facing = 0.13 + 0.87 * pow(1.0 - z, 1.5);
  float light = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(p.z * 4.0 + p.x * 2.0 - t), 2.0);
  float crease = dot(p, normalize(vec3(0.8, 0.3, 0.6))) + 0.25 * sin(4.5 * p.y - t * 0.6) - 0.66;
  float creaseAA = max(fwidth(crease), 0.0015);
  float fine = 1.0 - smoothstep(0.003, 0.003 + creaseAA, abs(crease));
  float localVitality = dot(screenRegions, mix(vec4(0.5), vitality, metricCompleteness));
  float localMeasured = dot(screenRegions, metricCompleteness);
  float brokenPattern = smoothstep(0.06, 0.46, 0.5 + 0.5 * sin(p.x * 17.0 + p.y * 13.0 - t * 1.8));
  float continuity = mix(1.0, mix(brokenPattern, 1.0, localVitality), localMeasured);
  float ribbon = ((line * 1.8 + companion * 0.45 + glow) * facing * light + fine * facing * 0.5)
    * continuity * mix(0.48, 1.12, localVitality);

  // The film remains mostly white; the accent is deliberately restrained.
  float film = exp(-abs(f + 0.023) * 65.0) * 0.014 * (0.4 + 0.6 * light);
  float rim = pow(1.0 - z, 9.0);
  float az = atan(n.y, n.x);
  float rimLight = 0.10 + 0.65 * pow(0.5 + 0.5 * sin(az * 2.0 - t * 1.3 + 0.8), 7.0);
  float edge = exp(-pow((1.0 - r) / 0.0055, 2.0)) * 0.18;
  float caustic = exp(-abs(f) * 32.0) * pow(1.0 - z, 3.0) * 3.5;
  float shade = 0.003 + 0.012 * pow(1.0 - z, 2.0);
  float brightness = shade + uIntensity * (rim * rimLight * 1.6 + edge + ribbon + film + caustic);
  brightness = 1.0 - exp(-brightness * 1.65);
  // Keep the central reading area quiet even when a membrane line crosses it.
  // The rim and local metric fields remain visible around the outside.
  brightness *= mix(0.34, 1.0, smoothstep(0.16, 0.34, r));

  // Four broad, overlapping lobes keep the metrics legible without making a
  // four-way pie chart. Missing metrics remain neutral only in their lobe.
  vec4 regions = vec4(
    0.22 + lobe(p, normalize(vec3(-0.62, 0.42, 0.70))),
    0.22 + lobe(p, normalize(vec3(0.64, 0.30, 0.72))),
    0.22 + lobe(p, normalize(vec3(-0.46, -0.54, 0.70))),
    0.22 + lobe(p, normalize(vec3(0.52, -0.50, 0.70)))
  );
  regions *= vec4(
    0.94 + 0.06 * sin(t * mix(0.82, 0.82 + metricScores.x * 0.22, metricCompleteness.x) + p.y * 2.3),
    0.94 + 0.06 * sin(t * mix(0.82, 0.82 + metricScores.y * 0.22, metricCompleteness.y) - p.x * 2.1 + 1.4),
    0.94 + 0.06 * sin(t * mix(0.82, 0.82 + metricScores.z * 0.22, metricCompleteness.z) + p.z * 2.0 + 2.6),
    0.94 + 0.06 * sin(t * mix(0.82, 0.82 + metricScores.w * 0.22, metricCompleteness.w) - p.y * 2.6 + 4.2)
  );
  regions /= max(dot(regions, vec4(1.0)), 0.001);
  // Keep semantic colour locations stable on screen while retaining enough
  // object-space contribution for the membrane to feel dimensional.
  regions = screenRegions * 0.72 + regions * 0.28;
  regions = pow(regions, vec4(1.65));
  regions /= max(dot(regions, vec4(1.0)), 0.001);

  vec3 neutral = vec3(0.94, 0.955, 0.97);
  vec4 colourPresence = metricCompleteness * (vec4(0.025) + vitality * 0.68 + highVitality * 0.295);
  vec3 metricColor =
    regions.x * mix(neutral, uAccentSleep, uAccentStrength * colourPresence.x)
    + regions.y * mix(neutral, uAccentRecovery, uAccentStrength * colourPresence.y)
    + regions.z * mix(neutral, uAccentActivity, uAccentStrength * colourPresence.z)
    + regions.w * mix(neutral, uAccentCirculation, uAccentStrength * colourPresence.w);

  // A low supplied score still has a coloured lobe, while missing data is
  // quieter and neutral. This preserves the distinction without judgemental
  // red/green semantics.
  float localResponse = dot(regions, vec4(
    mix(0.72, 0.58 + 0.42 * metricScores.x, metricCompleteness.x),
    mix(0.72, 0.58 + 0.42 * metricScores.y, metricCompleteness.y),
    mix(0.72, 0.58 + 0.42 * metricScores.z, metricCompleteness.z),
    mix(0.72, 0.58 + 0.42 * metricScores.w, metricCompleteness.w)
  ));
  float localColourPresence = dot(regions, colourPresence) * uAccentStrength;
  vec3 darkMembrane = metricColor * brightness * localResponse;
  vec3 lightNeutral = vec3(1.0 - clamp(brightness * localResponse * 1.08, 0.0, 0.94));
  vec3 lightMembrane = mix(lightNeutral, mix(lightNeutral, metricColor, 0.46), clamp(localColourPresence, 0.0, 1.0));
  gl_FragColor = vec4(mix(darkMembrane, lightMembrane, uLightMode), 1.0);
}
`;
