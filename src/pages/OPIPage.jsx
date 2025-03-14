import React, { useState, useEffect } from 'react';
import { UserGroupIcon } from '@heroicons/react/24/solid';

export default function OPIPage() {
  const [contactView, setContactView] = useState('fsc');
  const [selectedUnit, setSelectedUnit] = useState('');
  
  // Add theme state
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('elite-chat-theme');
    if (storedTheme) return storedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Update document and localStorage when theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('elite-chat-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Data structure mapping units to their FSC and FMC contacts
  const unitContacts = {
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

  // All available units
  const allUnits = Object.keys(unitContacts).sort();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Add theme toggle button */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center p-3 bg-[var(--card)] text-[var(--text)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-[var(--primary)] hover:bg-[var(--background-secondary)] hover:scale-110"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 14.12A7.78 7.78 0 019.88 4a7.78 7.78 0 002.9 15.1 7.78 7.78 0 007.22-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        <div className="text-center mb-12">
          <UserGroupIcon className="w-16 h-16 text-[var(--primary)] mx-auto mb-4" />
          <h1 className="text-4xl font-bold mb-4">Office of Primary Interest</h1>
          <p className="text-[var(--text-secondary)]">Find your unit's point of contact for financial services and management</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl shadow-lg border border-[var(--border)] overflow-hidden">
          <div className="p-6 border-b border-[var(--border)]">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setContactView('fsc')}
                className={`w-full sm:min-w-[200px] px-6 py-3 text-center rounded-lg transition-colors duration-200 ${
                  contactView === 'fsc'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--background)] text-[var(--text)] hover:bg-[var(--background-secondary)]'
                }`}
              >
                Financial Services Cell (FSC)
              </button>
              <button
                onClick={() => setContactView('fmc')}
                className={`w-full sm:min-w-[200px] px-6 py-3 text-center rounded-lg transition-colors duration-200 ${
                  contactView === 'fmc' 
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--background)] text-[var(--text)] hover:bg-[var(--background-secondary)]'
                }`}
              >
                Financial Management Cell (FMC)
              </button>
              <button
                onClick={() => setContactView('byUnit')}
                className={`w-full sm:min-w-[200px] px-6 py-3 text-center rounded-lg transition-colors duration-200 ${
                  contactView === 'byUnit'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--background)] text-[var(--text)] hover:bg-[var(--background-secondary)]'
                }`}
              >
                Find by Unit
              </button>
            </div>
          </div>

          <div className="p-6">
            {contactView === 'byUnit' ? (
              <div className="space-y-8">
                <div className="bg-[var(--background)] p-6 rounded-lg">
                  <h3 className="font-semibold mb-4 text-lg">Select Your Unit</h3>
                  <select
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="w-full p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="">-- Select a Unit --</option>
                    {allUnits.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedUnit && unitContacts[selectedUnit] && (
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="bg-[var(--background)] p-6 rounded-lg">
                      <h3 className="font-semibold mb-3 text-xl text-[var(--primary)]">Your FSC Contact</h3>
                      <div className="p-4 bg-[var(--card)] rounded-lg">
                        <div className="font-medium">{unitContacts[selectedUnit].fsc}</div>
                        <div className="text-sm text-[var(--text-secondary)] my-2">
                          Financial Services Cell (FSC)
                        </div>
                        {unitContacts[selectedUnit].fscEmail ? (
                          <a 
                            href={`mailto:${unitContacts[selectedUnit].fscEmail}`}
                            className="text-[var(--primary)] hover:underline break-all"
                          >
                            {unitContacts[selectedUnit].fscEmail}
                          </a>
                        ) : (
                          <span className="text-[var(--text-secondary)]">No direct contact - please contact FSC leadership</span>
                        )}
                      </div>
                    </div>

                    <div className="bg-[var(--background)] p-6 rounded-lg">
                      <h3 className="font-semibold mb-3 text-xl text-[var(--primary)]">Your FMC Contact</h3>
                      <div className="p-4 bg-[var(--card)] rounded-lg">
                        <div className="font-medium">{unitContacts[selectedUnit].fmc}</div>
                        <div className="text-sm text-[var(--text-secondary)] my-2">
                          Financial Management Cell (FMC)
                        </div>
                        <a 
                          href={`mailto:${unitContacts[selectedUnit].fmcEmail}`}
                          className="text-[var(--primary)] hover:underline break-all"
                        >
                          {unitContacts[selectedUnit].fmcEmail}
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : contactView === 'fsc' ? (
              <div className="space-y-8">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="bg-[var(--background)] p-6 rounded-lg">
                    <h3 className="font-semibold mb-3 text-lg">FSC Leadership</h3>
                    <ul className="space-y-4">
                      <li className="p-4 bg-[var(--card)] rounded-lg">
                        <div className="font-medium">PO 1 Salehi - FSC WO</div>
                        <a 
                          href="mailto:Amir.Salehi@forces.gc.ca"
                          className="text-[var(--primary)] hover:underline break-all"
                        >
                          Amir.Salehi@forces.gc.ca
                        </a>
                      </li>
                      <li className="p-4 bg-[var(--card)] rounded-lg">
                        <div className="font-medium">Sgt Zeng - FSC 2IC</div>
                        <a 
                          href="mailto:aidi.zeng@forces.gc.ca"
                          className="text-[var(--primary)] hover:underline break-all"
                        >
                          aidi.zeng@forces.gc.ca
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-[var(--background)] p-6 rounded-lg">
                    <h3 className="font-semibold mb-3 text-lg">Section 1</h3>
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">Cpl Downes</div>
                      <div className="text-sm text-[var(--text-secondary)] my-2">
                        Units: 2 Int, 32 CBG HQ, 32 CER, 32 Svc Bn, GGHG
                      </div>
                      <a 
                        href="mailto:william.downes@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        william.downes@forces.gc.ca
                      </a>
                    </div>
                  </div>

                  <div className="bg-[var(--background)] p-6 rounded-lg">
                    <h3 className="font-semibold mb-3 text-lg">Section 2</h3>
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">Sgt Ro</div>
                      <div className="text-sm text-[var(--text-secondary)] my-2">
                        Units: 48th Highrs, 7 Tor, Tor Scots, QOR
                      </div>
                      <a 
                        href="mailto:eugene.ro@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        eugene.ro@forces.gc.ca
                      </a>
                    </div>
                  </div>

                  <div className="bg-[var(--background)] p-6 rounded-lg">
                    <h3 className="font-semibold mb-3 text-lg">Section 3</h3>
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">Sgt Zeng</div>
                      <div className="text-sm text-[var(--text-secondary)] my-2">
                        Units: 32 Sigs, Lorne Scots, QY Rang, R Regt C
                      </div>
                      <a 
                        href="mailto:aidi.zeng@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        aidi.zeng@forces.gc.ca
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="bg-[var(--background)] p-6 rounded-lg">
                    <h3 className="font-semibold mb-3 text-lg">Group 1</h3>
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">Sgt Jennifer Wood</div>
                      <div className="text-sm text-[var(--text-secondary)] my-2">
                        Units: GGHG, QY Rang, 7 Tor, 48th
                      </div>
                      <a 
                        href="mailto:JENNIFER.WOOD@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        JENNIFER.WOOD@forces.gc.ca
                      </a>
                    </div>
                  </div>

                  <div className="bg-[var(--background)] p-6 rounded-lg">
                    <h3 className="font-semibold mb-3 text-lg">Group 2</h3>
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">Sgt Gordon Brown</div>
                      <div className="text-sm text-[var(--text-secondary)] my-2">
                        Units: R Regt C, 32 Svc Bn, QOR, 32 CER
                      </div>
                      <a 
                        href="mailto:GORDON.BROWN2@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        GORDON.BROWN2@forces.gc.ca
                      </a>
                    </div>
                  </div>

                  <div className="bg-[var(--background)] p-6 rounded-lg">
                    <h3 className="font-semibold mb-3 text-lg">Group 3</h3>
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">MCpl Angela McDonald</div>
                      <div className="text-sm text-[var(--text-secondary)] my-2">
                        Units: 32 Sig Regt, Lorne Scots, Tor Scots, 2 Int
                      </div>
                      <a 
                        href="mailto:ANGELA.MCDONALD@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        ANGELA.MCDONALD@forces.gc.ca
                      </a>
                    </div>
                  </div>

                  <div className="bg-[var(--background)] p-6 rounded-lg">
                    <h3 className="font-semibold mb-3 text-lg">Group 4</h3>
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">Sgt Mabel James</div>
                      <div className="text-sm text-[var(--text-secondary)] my-2">
                        Units: Linc & Welld, 56 Fd
                      </div>
                      <a 
                        href="mailto:MABEL.JAMES@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        MABEL.JAMES@forces.gc.ca
                      </a>
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--background)] p-6 rounded-lg">
                  <h3 className="font-semibold mb-3 text-lg">Additional Contacts</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">Alternate: Sgt Peter Cuprys</div>
                      <a 
                        href="mailto:PETER.CUPRYS@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        PETER.CUPRYS@forces.gc.ca
                      </a>
                    </div>
                    <div className="p-4 bg-[var(--card)] rounded-lg">
                      <div className="font-medium">32 CBG HQ Fin Mgt</div>
                      <a 
                        href="mailto:DND.GTA.B32.FinMgt-GestFin.MDN@forces.gc.ca"
                        className="text-[var(--primary)] hover:underline break-all"
                      >
                        DND.GTA.B32.FinMgt-GestFin.MDN@forces.gc.ca
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}