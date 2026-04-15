export interface CivDefinition {
  readonly name:    string
  readonly leaders: readonly string[]
}

// Derived from notes/civ-reference/civilizations.json
export const CIV_DEFINITIONS: readonly CivDefinition[] = [
  { name: 'America',           leaders: ['George Washington', 'Franklin D. Roosevelt', 'Lincoln'] },
  { name: 'Arabs',             leaders: ['Saladin'] },
  { name: 'Aztecs',            leaders: ['Montezuma'] },
  { name: 'Babylon',           leaders: ['Hammurabi'] },
  { name: 'Byzantium',         leaders: ['Justinian'] },
  { name: 'Carthage',          leaders: ['Hannibal'] },
  { name: 'Celts',             leaders: ['Brennus', 'Boudica'] },
  { name: 'China',             leaders: ['Mao Zedong', 'Qin Shi Huang'] },
  { name: 'Egypt',             leaders: ['Hatshepsut', 'Rameses II'] },
  { name: 'England',           leaders: ['Victoria', 'Elizabeth', 'Churchill'] },
  { name: 'Ethiopia',          leaders: ['Zara Yaqob'] },
  { name: 'France',            leaders: ['Louis XIV', 'Napoleon', 'Charles de Gaulle'] },
  { name: 'Germany',           leaders: ['Bismarck', 'Frederick'] },
  { name: 'Greece',            leaders: ['Alexander', 'Pericles'] },
  { name: 'Holy Roman Empire', leaders: ['Charlemagne'] },
  { name: 'Inca',              leaders: ['Huayna Capac'] },
  { name: 'India',             leaders: ['Mahatma Gandhi', 'Asoka'] },
  { name: 'Japan',             leaders: ['Tokugawa'] },
  { name: 'Khmer',             leaders: ['Suryavarman II'] },
  { name: 'Korea',             leaders: ['Wang Kon'] },
  { name: 'Mali',              leaders: ['Mansa Musa'] },
  { name: 'Maya',              leaders: ['Pacal II'] },
  { name: 'Mongolia',          leaders: ['Genghis Khan', 'Kublai Khan'] },
  { name: 'Native Americans',  leaders: ['Sitting Bull'] },
  { name: 'Netherlands',       leaders: ['Willem van Oranje'] },
  { name: 'Ottoman',           leaders: ['Mehmed II', 'Suleiman'] },
  { name: 'Persia',            leaders: ['Cyrus', 'Darius I'] },
  { name: 'Portugal',          leaders: ['Joao II'] },
  { name: 'Rome',              leaders: ['Augustus', 'Julius Caesar'] },
  { name: 'Russia',            leaders: ['Catherine', 'Peter', 'Stalin'] },
  { name: 'Spain',             leaders: ['Isabella'] },
  { name: 'Sumeria',           leaders: ['Gilgamesh'] },
  { name: 'Viking',            leaders: ['Ragnar'] },
  { name: 'Zulu',              leaders: ['Shaka'] },
]

export function getCivDef(name: string): CivDefinition | undefined {
  return CIV_DEFINITIONS.find(c => c.name === name)
}
