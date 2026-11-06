import {expect,it} from 'vitest';
import {messytitlefixer} from '../lyrics/messytitlefixer';

it.each([
 ['Popular (with Playboi Carti & Madonna) - From The Idol Vol. 1 (Music from the HBO Original Series)',
  'The Weeknd, Playboi Carti, Madonna','Popular'],
 ['Rathinamo - Female Version','','Rathinamo'],
 ['Vizhi Veekura (Music Video)| Saanve Megghana| Sai Smrit','Abhiyankar','Vizhi Veekura'],
 ['Vizhi Veekura, Abhiyankar (Music Video)| Saanve Megghana| Sai Smrit','Abhiyankar','Vizhi Veekura'],
 ['Vizhi Veekura Abhyankar (Music Video)| Saanve Megghana| Sai Smrit','Abhyankar','Vizhi Veekura'],
 ['Vizhi Veekura Abhyankar | Saanve Megghana| Sai Smrit','Abhyankar','Vizhi Veekura'],
 ['Vizhi Veekura by Abhyankar','Abhyankar','Vizhi Veekura'],
 ['Vizhi Veekura ft. Abhyankar','Abhyankar','Vizhi Veekura'],
 ['Popular, The Weeknd','The Weeknd','Popular'],
 ['Blue - Gold','','Blue'],
 ['Unknown Artist - Song Name','','Unknown Artist'],
 ['The Weeknd - Blinding Lights','The Weeknd','Blinding Lights'],
 ['Blinding Lights - The Weeknd','The Weeknd','Blinding Lights'],
 ['Artist A & Artist B - Song Name','Artist A, Artist B','Song Name'],
 ['Ed Sheeran - Shape of You (Official Video)','Ed Sheeran','Shape of You'],
 ['Punchiri - Eechuu | Suhas | Chris Wayne','Eechuu','Punchiri'],
 ['@SaiAbhyankkar - Aasa Kooda (Music Video) | Preity','','Aasa Kooda'],
 ['Veezha Veera Lyrical (Tamil) | OM','Think Music India','Veezha Veera'],
 ['Apna Bana Le (From "Bhediya")','','Apna Bana Le'],
 ['Starboy (feat. Daft Punk)','','Starboy'],
 ['Starboy ft. Daft Punk','','Starboy'],
 ['Song (Live) [Official Video] {4K}','','Song'],
 ['Song Name (Remix)','','Song Name'],
 ['Song Name (Tamil Version)','','Song Name'],
 ['Song Name [2024 Remaster]','','Song Name'],
 ['Song Name (Male Version)','','Song Name'],
 ['Song Name - Live at Wembley','','Song Name'],
 ['Song Name Lyrics Video 4K','','Song Name'],
 ['(Don\u0027t Fear) The Reaper','','The Reaper'],
 ['I (Who Have Nothing)','','I'],
 ['(Song)','',''],
 ['((Song))','',''],
 ['Hello, Goodbye','','Hello, Goodbye'],
 ['Love, Me','Artist X','Love, Me'],
 ['Dancing with a Stranger','Sam Smith, Normani','Dancing with a Stranger'],
 ['Live and Let Die','','Live and Let Die'],
 ['Music for a Sushi Restaurant','','Music for a Sushi Restaurant'],
 ['Video Games','','Video Games'],
 ['Abhyankaram','Abhyankar','Abhyankaram'],
 ['A-Team','','A-Team'],
 ['AC/DC','','AC/DC'],
 ['Bengali-বাংলা','','Bengali-বাংলা'],
 ['മഴേ (Official Music Video)','','മഴേ'],
 ['காதல் [Tamil Version]','','காதல்'],
 ['अपना बना ले (Acoustic)','','अपना बना ले'],
 ['हिन्दी (Official Music Video)','','हिन्दी'],
] as const)('extracts only core song name: %s', (title,artist,expected)=>{
 expect(messytitlefixer(title,artist)).toBe(expected);
});
it('is idempotent and never reintroduces fully bracketed input',()=>{
 for(const input of ['Popular (with Madonna) - From The Idol','Vizhi Veekura Abhyankar','(Song)','(Dont Fear) The Reaper','Song Lyrics Video 4K']){
  const cleaned=messytitlefixer(input,'Abhyankar');
  expect(messytitlefixer(cleaned,'Abhyankar')).toBe(cleaned);
 }
 expect(messytitlefixer('(Song)')).toBe('');
});
