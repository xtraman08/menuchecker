import { Platform } from 'react-native';

// Palette: a cool, slightly green "menu paper" with deep ink. Chili is reserved for
// spice, teal for match, ochre for anything the AI wrote and diners haven't confirmed.
export const color = {
  paper: '#EDF0EE',
  card: '#FFFFFF',
  ink: '#18202E',
  inkSoft: '#4A5463',
  muted: '#6B7482',
  line: '#D5DBD8',
  chili: '#B3321E',
  chiliSoft: '#F4DCD6',
  teal: '#1D6B66',
  tealSoft: '#DCEDEA',
  ochre: '#7A5C12',
  ochreSoft: '#F7EDCF',
  danger: '#A12622',
  placeholder: '#DDE3E0',
} as const;

export const font = {
  // The native dish name is the one expressive typographic moment in the app.
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }),
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const type = {
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 34, color: color.ink },
  dishName: { fontFamily: font.display, fontSize: 24, lineHeight: 30, color: color.ink },
  dishNameCompact: { fontFamily: font.display, fontSize: 20, lineHeight: 26, color: color.ink },
  anchor: { fontFamily: font.body, fontSize: 16, lineHeight: 22, color: color.ink, fontWeight: '600' as const },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: color.inkSoft },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.muted },
  label: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.ink, fontWeight: '600' as const },
};
