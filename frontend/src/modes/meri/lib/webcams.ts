export interface Webcam {
  id: string;
  name: string;
  lat: number;
  lng: number;
  youtubeId: string;
}

// Port of Helsinki's Länsisatama live webcams (portofhelsinki.fi), one per
// passenger terminal building in Jätkäsaari. Static — no upstream API for
// these, so the list is just hardcoded here.
export const WEBCAMS: Webcam[] = [
  { id: 'lansisatama-lt1', name: 'Länsisatama LT1', lat: 60.15014, lng: 24.91500, youtubeId: '6hPWq2IG08M' },
  { id: 'lansisatama-lt2', name: 'Länsisatama LT2', lat: 60.14914, lng: 24.91340, youtubeId: 'JnJhFYhIjFs' },
];
