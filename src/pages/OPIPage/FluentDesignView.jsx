import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { 
  MagnifyingGlassIcon as Search, 
  UserGroupIcon, 
  EnvelopeIcon as Mail,
  PhoneIcon,
  SparklesIcon,
  ChevronRightIcon,
  UserIcon,
  BuildingOfficeIcon,
  ClockIcon,
  ViewColumnsIcon,
  ListBulletIcon
} from '@heroicons/react/24/outline';
import { SparklesIcon as CrownIcon } from '@heroicons/react/24/solid';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Fluent Card Component with Acrylic effect and Reveal highlight
const FluentCard = ({ contact, onClick, delay = 0, type = null }) => {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Reveal highlight effect
  const revealX = useTransform(mouseX, (value) => value - 150);
  const revealY = useTransform(mouseY, (value) => value - 150);
  
  const handleMouseMove = (e) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) {
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    }
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        delay,
        type: "spring",
        stiffness: 300,
        damping: 30
      }}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
      onClick={onClick}
      className="relative cursor-pointer"
    >
      {/* Acrylic Card */}
      <div className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-[var(--card)]/80",
        "backdrop-blur-xl backdrop-saturate-150",
        "border border-[var(--border)]/30",
        "shadow-lg hover:shadow-2xl transition-shadow duration-300"
      )}>
        {/* Reveal Highlight */}
        <motion.div
          className="absolute inset-0 opacity-0 pointer-events-none"
          style={{
            background: `radial-gradient(300px circle at ${revealX}px ${revealY}px, rgba(var(--primary-rgb), 0.1), transparent)`,
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.2s'
          }}
        />
        
        {/* Card Content */}
        <div className="relative z-10 p-6 sm:p-8">
          {/* Icon with glow effect */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: delay + 0.1 }}
            className="mb-6"
          >
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center",
              type === 'FMC' ? "bg-emerald-600 dark:bg-emerald-500" : "bg-[var(--primary)]",
              "shadow-lg",
              isHovered && (type === 'FMC' ? "shadow-emerald-600/30 dark:shadow-emerald-500/30" : "shadow-[var(--primary)]/30")
            )}>
              {type ? (
                <span className="text-white font-bold text-lg">{type}</span>
              ) : (
                <UserGroupIcon className="w-8 h-8 text-white" />
              )}
            </div>
          </motion.div>

          {/* Contact Info */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: delay + 0.2 }}
          >
            <h3 className="text-xl font-semibold mb-2 text-[var(--text)] flex items-center gap-2">
              {contact.name}
              {contact.isLeadership && (
                <CrownIcon className="w-5 h-5 text-yellow-500" title="Leadership" />
              )}
            </h3>
            <p className="text-[var(--text-secondary)] mb-4">
              {contact.role}
            </p>
          </motion.div>

          {/* Units */}
          {contact.units && contact.units.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.3 }}
              className="flex flex-wrap gap-2 mb-4"
            >
              {contact.units.slice(0, 3).map((unit, idx) => (
                <Badge 
                  key={idx}
                  variant="secondary"
                  className="backdrop-blur text-base px-4 py-2 font-semibold"
                >
                  {unit}
                </Badge>
              ))}
            </motion.div>
          )}

          {/* Email with hover effect */}
          <motion.a
            href={`mailto:${contact.email}`}
            className={cn(
              "inline-flex items-center gap-2 text-sm",
              "text-[var(--primary)]",
              "hover:text-[var(--primary-hover)]",
              "transition-colors duration-200"
            )}
            whileHover={{ x: 5 }}
          >
            <Mail className="w-4 h-4" />
            <span>{contact.email}</span>
            <ChevronRightIcon className="w-3 h-3" />
          </motion.a>
        </div>

        {/* Depth shadow layers */}
        <div className="absolute inset-x-0 -bottom-1 h-8 bg-black/5 dark:bg-black/10 blur-md transform scale-x-95" />
        <div className="absolute inset-x-0 -bottom-2 h-8 bg-black/3 dark:bg-black/5 blur-lg transform scale-x-90" />
      </div>
    </motion.div>
  );
};

// Fluent List Component (adopted from original)
const FluentList = ({ contact, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay }}
    className={cn(
      "p-4 rounded-lg",
      "bg-[var(--card)]/60 backdrop-blur-md",
      "hover:bg-[var(--background-secondary)] transition-colors",
      "border-b border-[var(--border)] last:border-0"
    )}
  >
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <h4 className="text-base font-semibold mb-1 flex items-center gap-2">
          {contact.name}
          {contact.isLeadership && (
            <CrownIcon className="w-4 h-4 text-yellow-500" title="Leadership" />
          )}
        </h4>
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
      <a 
        href={`mailto:${contact.email}`} 
        className="text-base text-[var(--primary)] hover:underline font-medium whitespace-nowrap"
      >
        {contact.email}
      </a>
    </div>
  </motion.div>
);

// Fluent Search Bar
const FluentSearchBar = ({ value, onChange, placeholder }) => {
  return (
    <div className="relative">
      <div className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-[var(--card)]/80",
        "backdrop-blur-xl backdrop-saturate-150",
        "border border-[var(--border)]/30",
        "shadow-md hover:shadow-lg transition-all duration-300",
        "focus-within:ring-2 focus-within:ring-[var(--primary)]/50"
      )}>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full pl-12 pr-4 py-4",
            "bg-transparent outline-none",
            "text-[var(--text)]",
            "placeholder-[var(--text-secondary)]"
          )}
        />
      </div>
    </div>
  );
};

// Navigation Pills
const NavigationPills = ({ activeView, onViewChange }) => {
  const views = [
    { id: 'all', label: 'All Contacts', icon: UserGroupIcon },
    { id: 'fsc', label: 'FSC', icon: BuildingOfficeIcon },
    { id: 'fmc', label: 'FMC', icon: BuildingOfficeIcon },
    { id: 'search', label: 'Search Unit', icon: Search }
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {views.map((view) => {
        const Icon = view.icon;
        const isActive = activeView === view.id;
        
        return (
          <motion.button
            key={view.id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onViewChange(view.id)}
            className={cn(
              "relative px-6 py-3 rounded-full",
              "flex items-center gap-2",
              "transition-all duration-300",
              "backdrop-blur-xl backdrop-saturate-150",
              isActive 
                ? "bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/30" 
                : "bg-[var(--card)]/60 hover:bg-[var(--card)]/80",
              "border border-[var(--border)]/30"
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="font-medium">{view.label}</span>
            
            {isActive && (
              <motion.div
                layoutId="activePill"
                className="absolute inset-0 bg-[var(--primary)] rounded-full -z-10"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

export default function FluentDesignView({ 
  unitContacts = {}, 
  fscContacts = [], 
  fmcContacts = [],
  contactView: initialView = 'all',
  selectedUnit = '',
  searchTerm = '',
  setSelectedUnit = () => {},
  setSearchTerm = () => {},
  setContactView = () => {}
}) {
  const [localView, setLocalView] = useState(initialView || 'all');
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
  const [viewStyle, setViewStyle] = useState('card'); // 'card' or 'list'
  
  // Ensure scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Combine all contacts for "All" view
  const allContacts = [...fscContacts, ...fmcContacts];
  
  // Filter units
  const allUnits = Object.keys(unitContacts).sort();
  const filteredUnits = allUnits.filter(unit =>
    unit.toLowerCase().includes(localSearchTerm.toLowerCase())
  );

  // Get contacts to display based on view
  const getDisplayContacts = () => {
    switch (localView) {
      case 'fsc':
        return fscContacts;
      case 'fmc':
        return fmcContacts;
      case 'all':
        return allContacts;
      default:
        return [];
    }
  };

  const displayContacts = getDisplayContacts();

  return (
    <div className="min-h-screen bg-[var(--background)] transition-colors duration-300">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[var(--primary)] rounded-full opacity-10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[var(--primary)] rounded-full opacity-10 blur-3xl animate-pulse animation-delay-2000" />
      </div>

      {/* Content */}
      <div className="relative z-10 px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">

          {/* View Style Toggle */}
          <div className="flex justify-between items-center mb-6">
            <NavigationPills activeView={localView} onViewChange={setLocalView} />
            
            <div className="flex gap-2">
              <button
                onClick={() => setViewStyle('card')}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  "backdrop-blur-xl",
                  viewStyle === 'card'
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--card)]/60 hover:bg-[var(--card)]/80 text-[var(--text)]"
                )}
              >
                <ViewColumnsIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewStyle('list')}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  "backdrop-blur-xl",
                  viewStyle === 'list'
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--card)]/60 hover:bg-[var(--card)]/80 text-[var(--text)]"
                )}
              >
                <ListBulletIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search Unit View */}
          {localView === 'search' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <div className="max-w-2xl mx-auto space-y-4">
                <FluentSearchBar
                  value={localSearchTerm}
                  onChange={setLocalSearchTerm}
                  placeholder="Search units..."
                />
                
                <div className={cn(
                  "rounded-2xl overflow-hidden",
                  "bg-[var(--card)]/80",
                  "backdrop-blur-xl backdrop-saturate-150",
                  "border border-[var(--border)]/30",
                  "shadow-lg"
                )}>
                  <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                    <SelectTrigger className="h-14 bg-transparent border-0 text-base">
                      <SelectValue placeholder="Select a unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredUnits.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedUnit && unitContacts[selectedUnit] && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    viewStyle === 'card'
                      ? "grid gap-6 md:grid-cols-2 max-w-4xl mx-auto mt-8"
                      : "max-w-4xl mx-auto mt-8 space-y-4"
                  )}
                >
                  {viewStyle === 'card' ? (
                    <>
                      <FluentCard
                        contact={{
                          name: unitContacts[selectedUnit].fsc,
                          role: 'Financial Services Cell (FSC)',
                          email: unitContacts[selectedUnit].fscEmail,
                          units: [selectedUnit]
                        }}
                        type="FSC"
                      />
                      <FluentCard
                        contact={{
                          name: unitContacts[selectedUnit].fmc,
                          role: 'Financial Management Cell (FMC)',
                          email: unitContacts[selectedUnit].fmcEmail,
                          units: [selectedUnit]
                        }}
                        type="FMC"
                        delay={0.1}
                      />
                    </>
                  ) : (
                    <>
                      <FluentList
                        contact={{
                          name: unitContacts[selectedUnit].fsc,
                          role: 'Financial Services Cell (FSC)',
                          email: unitContacts[selectedUnit].fscEmail,
                          units: [selectedUnit]
                        }}
                      />
                      <FluentList
                        contact={{
                          name: unitContacts[selectedUnit].fmc,
                          role: 'Financial Management Cell (FMC)',
                          email: unitContacts[selectedUnit].fmcEmail,
                          units: [selectedUnit]
                        }}
                        delay={0.1}
                      />
                    </>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Contacts Display */}
          {localView !== 'search' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                viewStyle === 'card'
                  ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                  : "space-y-2 max-w-4xl mx-auto"
              )}
            >
              {displayContacts.map((contact, index) => {
                // Determine if this is FSC or FMC based on role
                const isFSC = contact.role && contact.role.includes('FSC');
                const isFMC = contact.role && contact.role.includes('FMC');
                const type = isFSC ? 'FSC' : isFMC ? 'FMC' : null;
                
                return viewStyle === 'card' ? (
                  <FluentCard
                    key={index}
                    contact={contact}
                    delay={index * 0.05}
                    type={type}
                    onClick={() => window.location.href = `mailto:${contact.email}`}
                  />
                ) : (
                  <FluentList
                    key={index}
                    contact={contact}
                    delay={index * 0.05}
                  />
                );
              })}
            </motion.div>
          )}

          {/* Empty State */}
          {localView !== 'search' && displayContacts.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <UserIcon className="w-16 h-16 mx-auto text-[var(--text-secondary)] mb-4" />
              <p className="text-[var(--text-secondary)]">No contacts found</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Custom Styles for animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 0.1;
          }
          50% {
            opacity: 0.2;
          }
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        :root {
          --primary-rgb: 59, 130, 246;
        }
      `}</style>
    </div>
  );
}