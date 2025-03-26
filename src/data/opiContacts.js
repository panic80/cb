// src/data/opiContacts.js

// Data structure mapping units to their FSC and FMC contacts
export const unitContacts = {
  '2 Int': {
    fsc: 'Cpl Downes',
    fscEmail: 'william.downes@forces.gc.ca',
    fmc: 'MCpl Angela McDonald',
    fmcEmail: 'ANGELA.MCDONALD@forces.gc.ca',
  },
  '32 CBG HQ': {
    fsc: 'Cpl Downes',
    fscEmail: 'william.downes@forces.gc.ca',
    fmc: 'Sgt Gordon Brown',
    fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
  },
  '32 CER': {
    fsc: 'Cpl Downes',
    fscEmail: 'william.downes@forces.gc.ca',
    fmc: 'Sgt Gordon Brown',
    fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
  },
  '32 Svc Bn': {
    fsc: 'Cpl Downes',
    fscEmail: 'william.downes@forces.gc.ca',
    fmc: 'Sgt Gordon Brown',
    fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
  },
  'GGHG': {
    fsc: 'Cpl Downes',
    fscEmail: 'william.downes@forces.gc.ca',
    fmc: 'Sgt Jennifer Wood',
    fmcEmail: 'JENNIFER.WOOD@forces.gc.ca',
  },
  '48th Highrs': {
    fsc: 'Sgt Ro',
    fscEmail: 'eugene.ro@forces.gc.ca',
    fmc: 'Sgt Jennifer Wood',
    fmcEmail: 'JENNIFER.WOOD@forces.gc.ca',
  },
  '7 Tor': {
    fsc: 'Sgt Ro',
    fscEmail: 'eugene.ro@forces.gc.ca',
    fmc: 'Sgt Jennifer Wood',
    fmcEmail: 'JENNIFER.WOOD@forces.gc.ca',
  },
  'Tor Scots': {
    fsc: 'Sgt Ro',
    fscEmail: 'eugene.ro@forces.gc.ca',
    fmc: 'MCpl Angela McDonald',
    fmcEmail: 'ANGELA.MCDONALD@forces.gc.ca',
  },
  'QOR': {
    fsc: 'Sgt Ro',
    fscEmail: 'eugene.ro@forces.gc.ca',
    fmc: 'Sgt Gordon Brown',
    fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
  },
  '32 Sig Regt': {
    fsc: 'Sgt Zeng',
    fscEmail: 'aidi.zeng@forces.gc.ca',
    fmc: 'MCpl Angela McDonald',
    fmcEmail: 'ANGELA.MCDONALD@forces.gc.ca',
  },
  'Lorne Scots': {
    fsc: 'Sgt Zeng',
    fscEmail: 'aidi.zeng@forces.gc.ca',
    fmc: 'MCpl Angela McDonald',
    fmcEmail: 'ANGELA.MCDONALD@forces.gc.ca',
  },
  'QY Rang': {
    fsc: 'Sgt Zeng',
    fscEmail: 'aidi.zeng@forces.gc.ca',
    fmc: 'Sgt Jennifer Wood',
    fmcEmail: 'JENNIFER.WOOD@forces.gc.ca',
  },
  'R Regt C': {
    fsc: 'Sgt Zeng',
    fscEmail: 'aidi.zeng@forces.gc.ca',
    fmc: 'Sgt Gordon Brown',
    fmcEmail: 'GORDON.BROWN2@forces.gc.ca',
  },
  'Linc & Welld': {
    fsc: 'N/A',
    fscEmail: '',
    fmc: 'Sgt Mabel James',
    fmcEmail: 'MABEL.JAMES@forces.gc.ca',
  },
  '56 Fd': {
    fsc: 'N/A',
    fscEmail: '',
    fmc: 'Sgt Mabel James',
    fmcEmail: 'MABEL.JAMES@forces.gc.ca',
  },
};

// All available units, sorted alphabetically
export const allUnits = Object.keys(unitContacts).sort();

// Helper function to get units for a specific FSC contact
const getUnitsForFsc = (fscName) => {
  return allUnits.filter(unit => unitContacts[unit].fsc === fscName);
};

// Helper function to get units for a specific FMC contact
const getUnitsForFmc = (fmcName) => {
  return allUnits.filter(unit => unitContacts[unit].fmc === fmcName);
};

// FSC Contacts grouped by section/person, using helper functions for accuracy
export const fscContacts = {
  leadership: [
    { name: 'PO 1 Salehi - FSC WO', email: 'Amir.Salehi@forces.gc.ca' },
    { name: 'Sgt Zeng - FSC 2IC', email: 'aidi.zeng@forces.gc.ca' },
  ],
  sections: [
    { name: 'Cpl Downes', email: 'william.downes@forces.gc.ca', units: getUnitsForFsc('Cpl Downes') },
    { name: 'Sgt Ro', email: 'eugene.ro@forces.gc.ca', units: getUnitsForFsc('Sgt Ro') },
    { name: 'Sgt Zeng', email: 'aidi.zeng@forces.gc.ca', units: getUnitsForFsc('Sgt Zeng') },
  ],
};

// FMC Contacts grouped by person/group, using helper functions for accuracy
export const fmcContacts = {
  leadership: [
    { name: 'Sgt Peter Cuprys', email: 'PETER.CUPRYS@forces.gc.ca', isLeadership: true },
  ],
  groups: [
    { name: 'Sgt Jennifer Wood', email: 'JENNIFER.WOOD@forces.gc.ca', units: getUnitsForFmc('Sgt Jennifer Wood') },
    { name: 'Sgt Gordon Brown', email: 'GORDON.BROWN2@forces.gc.ca', units: getUnitsForFmc('Sgt Gordon Brown') },
    { name: 'MCpl Angela McDonald', email: 'ANGELA.MCDONALD@forces.gc.ca', units: getUnitsForFmc('MCpl Angela McDonald') },
    { name: 'Sgt Mabel James', email: 'MABEL.JAMES@forces.gc.ca', units: getUnitsForFmc('Sgt Mabel James') },
  ],
  additional: [
    { name: '32 CBG HQ Fin Mgt', email: 'DND.GTA.B32.FinMgt-GestFin.MDN@forces.gc.ca' },
  ],
};