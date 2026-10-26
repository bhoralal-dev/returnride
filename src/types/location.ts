/**
 * ReturnRide Domain Types - Location
 *
 * NOTE: Locations and aliases are data-driven records.
 * Cities, towns, and routes must NEVER be hardcoded into the application codebase.
 */

export interface Location {
  id: string;
  name: string; // e.g., "Karachi", "Umerkot", "Lahore", "Sukkur"
  localName?: string; // e.g., Urdu representation
  province?: string; // e.g., "Sindh", "Punjab", "KPK", "Balochistan", "AJK", "GB", "ICT"
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface LocationAlias {
  id: string;
  locationId: string;
  alias: string; // e.g., "KHI", "Pindi", "Isloo", Roman Urdu synonyms
}
