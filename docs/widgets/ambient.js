// My PC Desktop Widget for Hearth & Horizon Screensaver (SDK Section 18)
export default async function (ctx) {
  const scenes = ['hearth', 'cinematic', 'rain', 'aurora', 'ocean', 'zen'];
  const labels = {
    hearth: { title: 'Grand Hearth Fireplace', icon: '🔥', sub: 'Crackling oak logs & warm parlor embers', accent: '#f97316' },
    cinematic: { title: 'Cinematic Stone Fireplace', icon: '🔥', sub: 'WebGL2 photorealistic limestone hearth & split oak logs', accent: '#f97316' },
    rain: { title: 'Midnight Rain & Glass', icon: '🌧️', sub: 'Refractive raindrops & distant thunder', accent: '#38bdf8' },
    aurora: { title: 'Aurora Borealis Fjord', icon: '🌌', sub: 'Solar curtains over still arctic water', accent: '#10b981' },
    ocean: { title: 'Bioluminescent Reef', icon: '🪼', sub: 'Deep indigo caustics & glowing plankton', accent: '#06b6d4' },
    zen: { title: 'Kyoto Zen Koi Pond', icon: '🏮', sub: 'Stone lanterns, ripples & bamboo breeze', accent: '#f59e0b' }
  };

  const st = ctx.state || { idx: 0 };
  if (ctx.action === 'next') {
    st.idx = (st.idx + 1) % scenes.length;
  } else if (ctx.action === 'prev') {
    st.idx = (st.idx - 1 + scenes.length) % scenes.length;
  } else if (ctx.settings && ctx.settings.scene && scenes.includes(ctx.settings.scene) && !ctx.state) {
    st.idx = scenes.indexOf(ctx.settings.scene);
  }

  const currentId = scenes[st.idx] || 'hearth';
  const info = labels[currentId];

  return {
    view: {
      icon: info.icon,
      big: info.title,
      sub: info.sub,
      text: 'Press OK to start screensaver, or use buttons to switch scene or open settings.',
      rows: [
        { label: 'Audio Engine', value: 'Studio PCM + CC0 Streams (No MIDI)' },
        { label: 'OLED Care', value: 'Pixel Orbit Active' }
      ],
      buttons: [
        { id: 'prev', label: 'Prev' },
        { id: 'next', label: 'Next' }
      ],
      accent: info.accent,
      link: 'scene/' + currentId
    },
    state: st
  };
}
