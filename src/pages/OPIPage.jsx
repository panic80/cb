import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  MagnifyingGlassIcon as Search, 
  UserGroupIcon, 
  EnvelopeIcon as Mail, 
  BuildingOfficeIcon as Building,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';
import '../styles/landing.css';
import '../styles/sticky-footer.css';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export default function OPIPage() {
  const [contactView, setContactView] = useState('search');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [designStyle, setDesignStyle] = useState('card'); // card, list, table
  
  // Initialize theme from localStorage or system preference
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('elite-chat-theme');
    if (storedTheme) return storedTheme;
    
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Toggle between light and dark with smooth transition
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('elite-chat-theme', newTheme);
      return newTheme;
    });
  }, []);

  // Update document when theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Contact data
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

  const allUnits = Object.keys(unitContacts).sort();
  const filteredUnits = allUnits.filter(unit =>
    unit.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // FSC contacts organized by section
  const fscContacts = [
    {
      name: 'PO 1 Salehi',
      role: 'FSC Warrant Officer',
      email: 'Amir.Salehi@forces.gc.ca',
      isLeadership: true
    },
    {
      name: 'Sgt Zeng',
      role: 'FSC Second-in-Command',
      email: 'aidi.zeng@forces.gc.ca',
      isLeadership: true
    },
    {
      name: 'Cpl Downes',
      role: 'Section 1',
      email: 'william.downes@forces.gc.ca',
      units: ['2 Int', '32 CBG HQ', '32 CER', '32 Svc Bn', 'GGHG']
    },
    {
      name: 'Sgt Ro',
      role: 'Section 2',
      email: 'eugene.ro@forces.gc.ca',
      units: ['48th Highrs', '7 Tor', 'Tor Scots', 'QOR']
    },
    {
      name: 'Sgt Zeng',
      role: 'Section 3',
      email: 'aidi.zeng@forces.gc.ca',
      units: ['32 Sig Regt', 'Lorne Scots', 'QY Rang', 'R Regt C']
    }
  ];

  // FMC contacts organized by group
  const fmcContacts = [
    {
      name: 'Sgt Jennifer Wood',
      role: 'Group 1',
      email: 'JENNIFER.WOOD@forces.gc.ca',
      units: ['GGHG', 'QY Rang', '7 Tor', '48th Highrs']
    },
    {
      name: 'Sgt Gordon Brown',
      role: 'Group 2',
      email: 'GORDON.BROWN2@forces.gc.ca',
      units: ['R Regt C', '32 Svc Bn', 'QOR', '32 CER']
    },
    {
      name: 'MCpl Angela McDonald',
      role: 'Group 3',
      email: 'ANGELA.MCDONALD@forces.gc.ca',
      units: ['32 Sig Regt', 'Lorne Scots', 'Tor Scots', '2 Int']
    },
    {
      name: 'Sgt Mabel James',
      role: 'Group 4',
      email: 'MABEL.JAMES@forces.gc.ca',
      units: ['Linc & Welld', '56 Fd']
    },
    {
      name: 'Sgt Peter Cuprys',
      role: 'Alternate Contact',
      email: 'PETER.CUPRYS@forces.gc.ca',
      units: []
    }
  ];

  // Contact Card Component - Mobile optimized
  const ContactCard = ({ contact }) => (
    <Card className="group rounded-xl p-4 sm:p-6 transition-all duration-200 hover:shadow-md border border-[var(--border)] bg-[var(--card)]">
      <div className="space-y-3 sm:space-y-4">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-[var(--text)] mb-1">
            {contact.name}
          </h3>
          <p className="text-sm sm:text-base text-[var(--text-secondary)]">
            {contact.role}
          </p>
        </div>
        
        {contact.units && contact.units.length > 0 && (
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {contact.units.map((unit, index) => (
              <Badge key={index} variant="secondary" className="text-xs sm:text-sm">
                {unit}
              </Badge>
            ))}
          </div>
        )}
        
        <a 
          href={`mailto:${contact.email}`}
          className="inline-flex items-center text-sm sm:text-base text-[var(--primary)] hover:underline font-medium pt-2 break-all"
        >
          <Mail className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
          <span className="break-all">{contact.email}</span>
        </a>
      </div>
    </Card>
  );

  // Table Component - Mobile optimized with responsive design
  const ContactTable = ({ contacts, title }) => (
    <Card className="overflow-hidden rounded-xl shadow-sm">
      <CardHeader className="bg-[var(--background-secondary)] p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl">{title}</CardTitle>
      </CardHeader>
      
      {/* Mobile: Stack layout */}
      <div className="sm:hidden">
        <div className="space-y-4 p-4">
          {contacts.map((contact, index) => (
            <div key={index} className="border border-[var(--border)] rounded-lg p-4 space-y-3 bg-[var(--card)]">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <h4 className="font-medium text-base">{contact.name}</h4>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">{contact.role}</p>
                </div>
              </div>
              
              {contact.units && contact.units.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {contact.units.map((unit, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {unit}
                    </Badge>
                  ))}
                </div>
              )}
              
              <div className="pt-2 border-t border-[var(--border)]">
                <a 
                  href={`mailto:${contact.email}`} 
                  className="text-sm text-[var(--primary)] hover:underline font-medium break-all"
                >
                  {contact.email}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-12 px-6 text-base whitespace-nowrap min-w-[140px]">Name</TableHead>
              <TableHead className="h-12 px-6 text-base whitespace-nowrap min-w-[180px]">Role</TableHead>
              <TableHead className="h-12 px-6 text-base whitespace-nowrap min-w-[200px]">Units</TableHead>
              <TableHead className="h-12 px-6 text-base whitespace-nowrap min-w-[250px]">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact, index) => (
              <TableRow key={index} className="hover:bg-[var(--background-secondary)] transition-colors">
                <TableCell className="px-6 py-4">
                  <span className="text-base font-medium">{contact.name}</span>
                </TableCell>
                <TableCell className="px-6 py-4 text-base text-[var(--text-secondary)]">
                  {contact.role}
                </TableCell>
                <TableCell className="px-6 py-4">
                  {contact.units && contact.units.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {contact.units.map((unit, idx) => (
                        <Badge key={idx} variant="secondary" className="text-sm">
                          {unit}
                        </Badge>
                      ))}
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell className="px-6 py-4">
                  <a href={`mailto:${contact.email}`} className="text-base text-[var(--primary)] hover:underline font-medium break-all">
                    {contact.email}
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );

  // List Component - Spacious layout
  const ContactList = ({ contact }) => (
    <div className="p-4 rounded-lg hover:bg-[var(--background-secondary)] transition-colors border-b border-[var(--border)] last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <h4 className="text-base font-semibold mb-1">{contact.name}</h4>
          <p className="text-base text-[var(--text-secondary)]">{contact.role}</p>
          {contact.units && contact.units.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {contact.units.map((unit, index) => (
                <Badge key={index} variant="secondary" className="text-sm">
                  {unit}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <a href={`mailto:${contact.email}`} className="text-base text-[var(--primary)] hover:underline font-medium whitespace-nowrap">
          {contact.email}
        </a>
      </div>
    </div>
  );

  return (
    <div className="root-container">
      <div className="flex flex-col min-h-screen">
        <div className="flex-grow">
          <div className="bg-[var(--background)] text-[var(--text)] pt-12">
            {/* Theme Toggle */}
            <div className="fixed top-4 right-4 z-50">
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center p-3 bg-[var(--card)] text-[var(--text)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-[var(--primary)] hover:bg-[var(--background-secondary)] hover:scale-110"
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? (
                  // Moon icon for light mode
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 14.12A7.78 7.78 0 019.88 4a7.78 7.78 0 002.9 15.1 7.78 7.78 0 007.22-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  // Sun icon for dark mode
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3-7l-1.5 1.5M4.93 4.93l1.5 1.5m11.14 11.14l1.5 1.5M4.93 19.07l1.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>

            {/* Hero Section - Enhanced with Main Page Theme */}
            <header className="relative min-h-[35vh] sm:min-h-[40vh] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8 md:pb-12 hero-gradient overflow-hidden border-b border-[var(--border)]">
              {/* Back Button - Mobile optimized */}
              <Link 
                to="/" 
                className="absolute top-3 left-3 sm:top-4 sm:left-4 z-50 flex items-center gap-1 sm:gap-2 px-3 py-2 sm:px-4 bg-[var(--card)] text-[var(--text)] rounded-full shadow-lg hover:shadow-xl transition-all duration-300 border border-[var(--border)] hover:bg-[var(--background-secondary)] hover:scale-105 group"
                aria-label="Back to main page"
              >
                <ArrowLeftIcon className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:-translate-x-1" />
                <span className="font-medium text-sm sm:text-base">Back</span>
              </Link>

              {/* Decorative Background Elements */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute w-[400px] h-[400px] rounded-full blur-3xl opacity-20 floating"
                  style={{
                    background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
                    top: '-5%',
                    left: '-5%',
                  }}
                />
                <div className="absolute w-[400px] h-[400px] rounded-full blur-3xl opacity-20 floating"
                  style={{
                    background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
                    bottom: '-5%',
                    right: '-5%',
                    animationDelay: '-1.5s',
                  }}
                />
              </div>

              <div className="w-full max-w-4xl mx-auto text-center relative z-10">
                {/* Animated Icon - Mobile optimized */}
                <div className="mb-6 sm:mb-10 flex justify-center transform transition-all duration-500 hover:scale-110">
                  <UserGroupIcon
                    className="w-16 h-16 sm:w-20 sm:h-20 text-[var(--primary)] animate-scale"
                    style={{
                      filter: 'drop-shadow(0 0 15px rgba(var(--primary-rgb), 0.3))',
                    }}
                    aria-hidden="true"
                  />
                </div>

                {/* Title with Enhanced Typography - Mobile optimized */}
                <div className="space-y-4 sm:space-y-6">
                  <h1
                    className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 animate-fade-up gradient-text"
                    style={{ animationDelay: '0.2s' }}
                    role="heading"
                    aria-level="1"
                  >
                    Office of Primary Interest
                    <span
                      className="block text-sm sm:text-lg md:text-xl mt-2 sm:mt-4 text-[var(--text-secondary)] font-normal animate-fade-up"
                      style={{ animationDelay: '0.4s' }}
                    >
                      Financial Services Contact Directory • 32 CBG
                    </span>
                  </h1>

                  <p
                    className="text-base sm:text-lg md:text-xl text-center max-w-2xl mx-auto text-[var(--text)] opacity-90 leading-relaxed animate-fade-up glass p-4 sm:p-6 rounded-2xl"
                    style={{ animationDelay: '0.6s' }}
                  >
                    Your comprehensive directory for FSC and FMC contact information. Find the right personnel for your unit's financial services and management needs.
                  </p>
                </div>
              </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-12">

              {/* Navigation - Mobile optimized */}
              <div className="mb-8 sm:mb-12">
                <Tabs value={contactView} onValueChange={setContactView} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-12 sm:h-16 p-1">
                    <TabsTrigger value="fsc" className="text-xs sm:text-base font-medium px-1 sm:px-3">
                      <span className="hidden sm:inline">FSC Contacts</span>
                      <span className="sm:hidden">FSC</span>
                    </TabsTrigger>
                    <TabsTrigger value="fmc" className="text-xs sm:text-base font-medium px-1 sm:px-3">
                      <span className="hidden sm:inline">FMC Contacts</span>
                      <span className="sm:hidden">FMC</span>
                    </TabsTrigger>
                    <TabsTrigger value="search" className="text-xs sm:text-base font-medium px-1 sm:px-3">
                      <span className="hidden sm:inline">Search by Unit</span>
                      <span className="sm:hidden">Search</span>
                    </TabsTrigger>
                    </TabsList>
                    
                    {/* View Selector - Mobile optimized */}
                    <div className="flex justify-center gap-2 mt-4 sm:mt-6">
                      <Button
                        variant={designStyle === 'card' ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setDesignStyle('card')}
                        className="px-3 sm:px-4 text-sm sm:text-base"
                      >
                        <span className="mr-1 sm:mr-2">▦</span>
                        Cards
                      </Button>
                      <Button
                        variant={designStyle === 'table' ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setDesignStyle('table')}
                        className="px-3 sm:px-4 text-sm sm:text-base"
                      >
                        <span className="mr-1 sm:mr-2">⊡</span>
                        Table
                      </Button>
                    </div>
                </Tabs>
              </div>

              {/* Content */}
              <Tabs value={contactView} onValueChange={setContactView}>
                <TabsContent value="search" className="space-y-6 sm:space-y-8">
                  <Card className="border border-[var(--border)] rounded-xl shadow-sm">
                    <CardHeader className="pb-4 sm:pb-6 p-4 sm:p-6">
                      <CardTitle className="text-lg sm:text-xl">Find Your Unit</CardTitle>
                      <CardDescription className="text-sm sm:text-base">Search or select your unit to view contact information</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <div className="space-y-4 sm:space-y-6">
                        <div className="relative">
                          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                          <Input
                            placeholder="Search units..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 sm:pl-12 h-10 sm:h-12 text-sm sm:text-base"
                          />
                        </div>
                        
                        <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                          <SelectTrigger className="h-10 sm:h-12 text-sm sm:text-base">
                            <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredUnits.map((unit) => (
                              <SelectItem key={unit} value={unit} className="py-2 sm:py-3 text-sm sm:text-base">
                                {unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedUnit && unitContacts[selectedUnit] && (
                    <div>
                      {designStyle === 'table' ? (
                        <ContactTable 
                          contacts={[
                            {
                              name: unitContacts[selectedUnit].fsc,
                              role: 'Financial Services Cell (FSC)',
                              email: unitContacts[selectedUnit].fscEmail,
                              units: [selectedUnit]
                            },
                            {
                              name: unitContacts[selectedUnit].fmc,
                              role: 'Financial Management Cell (FMC)',
                              email: unitContacts[selectedUnit].fmcEmail,
                              units: [selectedUnit]
                            }
                          ]}
                          title={`Contacts for ${selectedUnit}`}
                        />
                      ) : designStyle === 'list' ? (
                        <Card className="border-2 shadow-xl">
                          <CardHeader className="p-8 pb-6">
                            <CardTitle className="text-3xl font-bold">Contacts for {selectedUnit}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-6 p-8 pt-0">
                            <ContactList
                              contact={{
                                name: unitContacts[selectedUnit].fsc,
                                role: 'Financial Services Cell (FSC)',
                                email: unitContacts[selectedUnit].fscEmail,
                                units: [selectedUnit]
                              }}
                            />
                            <ContactList
                              contact={{
                                name: unitContacts[selectedUnit].fmc,
                                role: 'Financial Management Cell (FMC)',
                                email: unitContacts[selectedUnit].fmcEmail,
                                units: [selectedUnit]
                              }}
                            />
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="space-y-6 sm:space-y-8">
                          <div className="text-center">
                            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3">Contacts for {selectedUnit}</h2>
                            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground">Your financial services team</p>
                          </div>
                          <div className="grid gap-4 sm:gap-6 lg:gap-8 md:grid-cols-2">
                            <ContactCard
                              contact={{
                                name: unitContacts[selectedUnit].fsc,
                                role: 'Financial Services Cell (FSC)',
                                email: unitContacts[selectedUnit].fscEmail,
                                units: [selectedUnit]
                              }}
                            />
                            <ContactCard
                              contact={{
                                name: unitContacts[selectedUnit].fmc,
                                role: 'Financial Management Cell (FMC)',
                                email: unitContacts[selectedUnit].fmcEmail,
                                units: [selectedUnit]
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="fsc" className="animate-fade-up" style={{ animationDelay: '1s' }}>
                  {designStyle === 'table' ? (
                    <ContactTable 
                      contacts={fscContacts}
                      title="Financial Services Cell (FSC)"
                    />
                  ) : designStyle === 'list' ? (
                    <Card className="glass rounded-2xl">
                      <CardHeader className="p-6">
                        <CardTitle className="text-xl">Financial Services Cell (FSC)</CardTitle>
                        <CardDescription>FSC personnel organized by sections</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 p-6 pt-0">
                        {fscContacts.map((contact, index) => (
                          <ContactList key={index} contact={contact} />
                        ))}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {fscContacts.map((contact, index) => (
                        <ContactCard key={index} contact={contact} />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="fmc" className="animate-fade-up" style={{ animationDelay: '1s' }}>
                  {designStyle === 'table' ? (
                    <ContactTable 
                      contacts={fmcContacts}
                      title="Financial Management Cell (FMC)"
                    />
                  ) : designStyle === 'list' ? (
                    <Card className="glass rounded-2xl">
                      <CardHeader className="p-6">
                        <CardTitle className="text-xl">Financial Management Cell (FMC)</CardTitle>
                        <CardDescription>FMC personnel organized by unit groups</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 p-6 pt-0">
                        {fmcContacts.map((contact, index) => (
                          <ContactList key={index} contact={contact} />
                        ))}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {fmcContacts.map((contact, index) => (
                        <ContactCard key={index} contact={contact} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Footer - Mobile optimized */}
            <footer className="mt-8 sm:mt-12 px-4 sm:px-6 lg:px-8 xl:px-12 border-t border-[var(--border)] bg-[var(--background-secondary)]" role="contentinfo">
              <div className="max-w-5xl mx-auto py-6 sm:py-8">
                <div className="text-center text-sm sm:text-base text-[var(--text)] opacity-60">
                  <p>&copy; {new Date().getFullYear()} G8 Administration Hub. All rights reserved.</p>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}