// Every ingredient, cup option and signature drink. Colours are the *display* colours we want
// to see on screen (sRGB hex); the renderer converts them through an inverse tone map.

export const TEAS = [
  { id: 'black', name: 'Black milk tea', short: 'Black tea', tea: '#7c3a12', milk: '#c99466', sigTea: 10, sigMilk: 48, style: 'blend', backdrop: '#a9d6cf' },
  { id: 'taro', name: 'Taro', short: 'Taro', tea: '#9370cc', milk: '#c7aee9', sigTea: 32, sigMilk: 48, style: 'blend', backdrop: '#f6d6a4' },
  { id: 'matcha', name: 'Matcha', short: 'Matcha', tea: '#4f9a2c', milk: '#b4d68f', sigTea: 46, sigMilk: 48, style: 'under', backdrop: '#f5c2cf' },
  { id: 'thai', name: 'Thai tea', short: 'Thai tea', tea: '#e8691c', milk: '#f2a566', sigTea: 20, sigMilk: 45, style: 'float', backdrop: '#acd5ee' },
  { id: 'strawberry', name: 'Strawberry', short: 'Strawberry', tea: '#e8355a', milk: '#f59ab1', sigTea: 26, sigMilk: 48, style: 'under', backdrop: '#b9e2cc' },
  { id: 'peaflower', name: 'Butterfly pea', short: 'Butterfly pea', tea: '#2c3fd0', milk: '#a3a9ec', sigTea: 3.2, sigMilk: 45, style: 'under', backdrop: '#f7d98f' },
  { id: 'brownsugar', name: 'Brown sugar', short: 'Brown sugar', tea: '#91561f', milk: '#d8a76f', sigTea: 22, sigMilk: 48, style: 'blend', backdrop: '#f2b48e' },
];

export const MILKS = [
  { id: 'none', name: 'No milk' },
  { id: 'fresh', name: 'Fresh milk', color: '#f0e8da', tint: 0 },
  { id: 'oat', name: 'Oat milk', color: '#ead9b8', tint: 0.22 },
  { id: 'coconut', name: 'Coconut milk', color: '#f3eee4', tint: 0.08 },
];

export const SYRUPS = [
  { id: 'none', name: 'No syrup' },
  { id: 'brownsugar', name: 'Brown sugar', thin: '#c4782e', thick: '#3f1b07', layer: '#9a5418', layerSig: 9 },
  { id: 'honey', name: 'Honey', thin: '#f5bb3c', thick: '#a85a06', layer: '#e2a034', layerSig: 8 },
  { id: 'strawberry', name: 'Strawberry', thin: '#ff6d8c', thick: '#a0102f', layer: '#e23656', layerSig: 11 },
];

// Particle toppings + the cheese foam cap.
export const TOPPINGS = [
  { id: 'pearls', name: 'Tapioca pearls', kind: 'pearl', count: 72 },
  { id: 'popS', name: 'Strawberry popping boba', kind: 'pop', color: '#ff2d55', count: 22 },
  { id: 'popM', name: 'Mango popping boba', kind: 'pop', color: '#ffa600', count: 22 },
  { id: 'popB', name: 'Blueberry popping boba', kind: 'pop', color: '#4b5bff', count: 22 },
  { id: 'lychee', name: 'Lychee jelly', kind: 'jelly', count: 24 },
  { id: 'foam', name: 'Cheese foam', kind: 'foam' },
];

export const ICE = [
  { id: 0, name: 'No ice', count: 0 },
  { id: 1, name: 'Light ice', count: 3 },
  { id: 2, name: 'Regular ice', count: 5 },
  { id: 3, name: 'Extra ice', count: 8 },
];

export const SLEEVES = [
  { id: 'gingham', name: 'Gingham sleeve' },
  { id: 'clouds', name: 'Cloud doodle sleeve' },
  { id: 'cherry', name: 'Cherry print sleeve' },
  { id: 'kraft', name: 'Kraft stamp sleeve' },
  { id: 'stripe', name: 'Pastel stripe sleeve' },
];

export const LIDS = [
  { id: 'film', name: 'Sealed film lid' },
  { id: 'dome', name: 'Dome lid' },
];

export const STRAWS = [
  { id: 'clear', name: 'Clear straw', color: '#ffffff' },
  { id: 'pink', name: 'Pastel pink straw', color: '#ff9fbd' },
  { id: 'matcha', name: 'Matcha green straw', color: '#8fcf86' },
  { id: 'black', name: 'Black straw', color: '#1a1a1c' },
];

export const PRESETS = [
  {
    id: 'tiger', name: 'Brown Sugar Tiger', tagline: 'fresh milk · brown sugar · tapioca pearls',
    tea: null, milk: 'fresh', syrup: 'brownsugar', toppings: ['pearls'], ice: 0,
    sleeve: 'kraft', lid: 'film', straw: 'black', backdrop: '#f2b48e',
  },
  {
    id: 'taro', name: 'Taro Cloud', tagline: 'taro · fresh milk · pearls · cheese foam',
    tea: 'taro', milk: 'fresh', syrup: 'none', toppings: ['pearls', 'foam'], ice: 1,
    sleeve: 'clouds', lid: 'dome', straw: 'clear', backdrop: '#f6d6a4',
  },
  {
    id: 'matcha', name: 'Matcha Latte', tagline: 'oat milk · ceremonial matcha · pearls',
    tea: 'matcha', milk: 'oat', syrup: 'none', toppings: ['pearls'], ice: 2,
    sleeve: 'gingham', lid: 'dome', straw: 'matcha', backdrop: '#f5c2cf',
  },
  {
    id: 'strawberry', name: 'Strawberry Lychee', tagline: 'strawberry milk · lychee jelly · popping boba',
    tea: 'strawberry', milk: 'fresh', syrup: 'strawberry', toppings: ['lychee', 'popS'], ice: 2,
    sleeve: 'cherry', lid: 'film', straw: 'pink', backdrop: '#b9e2cc',
  },
  {
    id: 'thai', name: 'Thai Tea', tagline: 'thai tea · coconut milk float · pearls',
    tea: 'thai', milk: 'coconut', syrup: 'none', toppings: ['pearls'], ice: 2,
    sleeve: 'stripe', lid: 'film', straw: 'clear', backdrop: '#acd5ee',
  },
  {
    id: 'peaflower', name: 'Butterfly Pea', tagline: 'butterfly pea · fresh milk · blueberry pops',
    tea: 'peaflower', milk: 'fresh', syrup: 'none', toppings: ['popB', 'lychee'], ice: 3,
    sleeve: 'clouds', lid: 'dome', straw: 'clear', backdrop: '#f7d98f',
  },
];

export const byId = (list, id) => list.find((x) => x.id === id) || null;

// A plain recipe object the director animates towards.
export function recipeFromPreset(p) {
  return {
    tea: p.tea, milk: p.milk, syrup: p.syrup, toppings: [...p.toppings], ice: p.ice,
    sleeve: p.sleeve, lid: p.lid, straw: p.straw, backdrop: p.backdrop,
  };
}

export function describe(r) {
  const parts = [];
  const tea = byId(TEAS, r.tea);
  const milk = byId(MILKS, r.milk);
  const syrup = byId(SYRUPS, r.syrup);
  if (tea) parts.push(tea.short.toLowerCase());
  if (milk && milk.id !== 'none') parts.push(milk.name.toLowerCase());
  if (syrup && syrup.id !== 'none') parts.push(syrup.name.toLowerCase() + ' syrup');
  for (const t of r.toppings) {
    const tp = byId(TOPPINGS, t);
    if (tp) parts.push(tp.name.toLowerCase().replace('tapioca ', ''));
  }
  if (r.ice) parts.push(byId(ICE, r.ice).name.toLowerCase());
  return parts.join(' · ') || 'an empty cup, waiting';
}
