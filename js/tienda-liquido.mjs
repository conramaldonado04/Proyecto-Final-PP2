// Aproximación visual: integra secciones circulares y conserva el volumen.
// No es CFD. El fondo de cinco apoyos se aproxima por su envolvente.
export class LiquidLevel {
  constructor(profile, fillHeight) {
    if (!Array.isArray(profile) || profile.length < 2 || !Number.isFinite(fillHeight)) throw new Error('Perfil interior inválido.');
    this.profile = profile;
    this.bottom = profile[0][0]; this.top = profile.at(-1)[0];
    this.maxRadius = Math.max(...profile.map(row => row[1]));
    if (profile.some(([y,r], i) => !Number.isFinite(y) || !Number.isFinite(r) || r <= 0 || (i > 0 && y <= profile[i-1][0]))) throw new Error('El perfil debe tener alturas crecientes y radios positivos.');
    this.layers = Array.from({ length: 64 }, (_, i) => {
      const dy = (this.top - this.bottom) / 64;
      const y = this.bottom + (i + 0.5) * dy, r = this.radius(y);
      return { y, r, volume: Math.PI * r * r * dy };
    });
    this.targetVolume = this.volumeBelow({ x: 0, y: 1, z: 0 }, fillHeight);
    this.fillHeight = fillHeight;
  }
  radius(y) {
    if (y <= this.bottom) return this.profile[0][1];
    if (y >= this.top) return this.profile.at(-1)[1];
    let lo = 0, hi = this.profile.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.profile[mid][0] < y) lo = mid; else hi = mid;
    }
    const [a, ra] = this.profile[lo], [b, rb] = this.profile[hi];
    return ra + (rb - ra) * (y - a) / (b - a);
  }
  volumeBelow(normal, offset) {
    const horizontal = Math.hypot(normal.x, normal.z);
    let volume = 0;
    for (const layer of this.layers) {
      const range = horizontal * layer.r;
      const c = range < 1e-10 ? (offset >= normal.y * layer.y ? 2 : -2) : (offset - normal.y * layer.y) / range;
      const fraction = c >= 1 ? 1 : c <= -1 ? 0 : 0.5 + (Math.asin(c) + c * Math.sqrt(1 - c * c)) / Math.PI;
      volume += layer.volume * fraction;
    }
    return volume;
  }
  offsetForVolume(normal) {
    if (Math.hypot(normal.x, normal.z) < 1e-7 && Math.abs(normal.y - 1) < 1e-7) return this.fillHeight;
    let lo = this.bottom - this.maxRadius, hi = this.top + this.maxRadius;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (this.volumeBelow(normal, mid) < this.targetVolume) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  edge(normal, offset, x, z) {
    let lo = this.bottom, hi = this.top;
    for (let i = 0; i < 22; i++) {
      const y = (lo + hi) / 2;
      if (normal.y * y + (normal.x * x + normal.z * z) * this.radius(y) < offset) lo = y; else hi = y;
    }
    const y = (lo + hi) / 2;
    return { y, r: this.radius(y) };
  }
}
