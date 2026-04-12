import { ResourceType, ImprovementType, type ResourceDef } from '../shared/types'

export const RESOURCE_DEFS: ResourceDef[] = [
  { id: ResourceType.Wheat,  name: 'Wheat',  color: 0xf0d060 },
  { id: ResourceType.Cow,    name: 'Cow',    color: 0xe0c080 },
  { id: ResourceType.Horse,  name: 'Horse',  color: 0xa0724a },
  { id: ResourceType.Iron,   name: 'Iron',   color: 0x8090a0 },
  { id: ResourceType.Gold,   name: 'Gold',   color: 0xffd700 },
  { id: ResourceType.Copper, name: 'Copper', color: 0xc87941 },
  { id: ResourceType.Stone,  name: 'Stone',  color: 0xa0a090 },
  { id: ResourceType.Coal,   name: 'Coal',   color: 0x404040 },
  { id: ResourceType.Fish,   name: 'Fish',   color: 0x60c0e0 },
  { id: ResourceType.Corn,   name: 'Corn',   color: 0xf0c030 },
]

export const RESOURCE_MAP = new Map(RESOURCE_DEFS.map(r => [r.id, r]))

// Which improvement unlocks each resource
export const RESOURCE_IMPROVEMENT: Partial<Record<ResourceType, ImprovementType>> = {
  [ResourceType.Wheat]:  ImprovementType.Farm,
  [ResourceType.Corn]:   ImprovementType.Farm,
  [ResourceType.Cow]:    ImprovementType.Pasture,
  [ResourceType.Horse]:  ImprovementType.Pasture,
  [ResourceType.Iron]:   ImprovementType.Mine,
  [ResourceType.Gold]:   ImprovementType.Mine,
  [ResourceType.Copper]: ImprovementType.Mine,
  [ResourceType.Stone]:  ImprovementType.Mine,
  [ResourceType.Coal]:   ImprovementType.Mine,
  [ResourceType.Fish]:   ImprovementType.FishingBoat,
}
