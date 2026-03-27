export const PLAYER_COLORS = ['White', 'Black', 'Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Grey'];

export const PLAYER_COLOR_HEX = {
  White: '#f0f0f0',
  Black: '#444444',
  Red: '#e74c3c',
  Blue: '#3498db',
  Yellow: '#f1c40f',
  Green: '#2ecc71',
  Purple: '#9b59b6',
  Orange: '#e67e22',
  Grey: '#a0a0a0',
};

export const STATUS_TEXT = {
  0: 'Waiting',
  1: 'Start',
  2: 'Move',
  3: 'Area',
  4: 'Attack',
  5: 'Damage',
  6: 'End',
};

export const AREA_NAMES = [
  "Hermit's Cabin",
  'Underworld Gate',
  'Church',
  'Cemetery',
  'Weird Woods',
  'Erstwhile Altar',
];

export const AUTO_REFRESH_OPTIONS = [0, 5, 10, 20, 30];

export const DAMAGE_TRACK_VALUES = Array.from({ length: 15 }, (_, index) => index);

export const DAMAGE_ROLE_MARKERS = [
  { camp: 'Shadow', initial: 'W', hp: 14 },
  { camp: 'Shadow', initial: 'V', hp: 13 },
  { camp: 'Shadow', initial: 'U', hp: 11 },
  { camp: 'Hunter', initial: 'G', hp: 14 },
  { camp: 'Hunter', initial: 'F', hp: 12 },
  { camp: 'Hunter', initial: 'E', hp: 10 },
  { camp: 'Civilian', initial: 'D', hp: 13 },
  { camp: 'Civilian', initial: 'C', hp: 11 },
  { camp: 'Civilian', initial: 'B', hp: 10 },
  { camp: 'Civilian', initial: 'A', hp: 8 },
];
