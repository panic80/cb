import React, { useState } from 'react';
import { CalendarIcon, MapIcon, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TripPlannerProps {
  onSubmit: (tripPlan: string) => void;
}

interface TripData {
  transportMethod: string;
  departureDate: Date | undefined;
  returnDate: Date | undefined;
  departureLocation: string;
  arrivalLocation: string;
  rnqProvided: boolean;
  travelAuthority: boolean;
  purpose: string;
  additionalNotes: string;
}

interface DistanceData {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
  };
  origin: string;
  destination: string;
  mode: string;
}

const transportMethods = [
  { value: 'personal-vehicle', label: 'Personal Vehicle' },
  { value: 'government-vehicle', label: 'Government Vehicle' },
  { value: 'air', label: 'Air Travel' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'rental', label: 'Rental Vehicle' },
  { value: 'other', label: 'Other' },
];

export const TripPlanner: React.FC<TripPlannerProps> = ({ onSubmit }) => {
  const [open, setOpen] = useState(false);
  const [distanceData, setDistanceData] = useState<DistanceData | null>(null);
  const [isLoadingDistance, setIsLoadingDistance] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [tripData, setTripData] = useState<TripData>({
    transportMethod: '',
    departureDate: undefined,
    returnDate: undefined,
    departureLocation: '',
    arrivalLocation: '',
    rnqProvided: false,
    travelAuthority: false,
    purpose: '',
    additionalNotes: '',
  });

  // Fetch distance data when locations change
  const fetchDistance = async (origin: string, destination: string) => {
    if (!origin || !destination) {
      setDistanceData(null);
      return;
    }

    setIsLoadingDistance(true);
    setDistanceError(null);

    try {
      const transportModeMap: { [key: string]: string } = {
        'personal-vehicle': 'driving',
        'government-vehicle': 'driving',
        'air': 'driving', // Will show driving distance to airport
        'train': 'transit',
        'bus': 'transit',
        'rental': 'driving',
        'other': 'driving'
      };

      const mode = transportModeMap[tripData.transportMethod] || 'driving';

      const response = await fetch('/api/maps/distance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin,
          destination,
          mode
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to calculate distance');
      }

      const data = await response.json();
      setDistanceData(data);
    } catch (error) {
      console.error('Error fetching distance:', error);
      setDistanceError(error instanceof Error ? error.message : 'Failed to calculate distance');
      setDistanceData(null);
    } finally {
      setIsLoadingDistance(false);
    }
  };

  // Debounce distance fetching
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (tripData.departureLocation && tripData.arrivalLocation) {
        fetchDistance(tripData.departureLocation, tripData.arrivalLocation);
      }
    }, 1000); // Wait 1 second after user stops typing

    return () => clearTimeout(timer);
  }, [tripData.departureLocation, tripData.arrivalLocation, tripData.transportMethod]);

  const handleSubmit = () => {
    // Generate formatted trip plan
    const tripPlan = generateTripPlan(tripData);
    onSubmit(tripPlan);
    
    // Reset form and close sheet
    setTripData({
      transportMethod: '',
      departureDate: undefined,
      returnDate: undefined,
      departureLocation: '',
      arrivalLocation: '',
      rnqProvided: false,
      travelAuthority: false,
      purpose: '',
      additionalNotes: '',
    });
    setDistanceData(null);
    setDistanceError(null);
    setOpen(false);
  };

  const generateTripPlan = (data: TripData): string => {
    const transport = transportMethods.find(t => t.value === data.transportMethod)?.label || 'Not specified';
    const departure = data.departureDate ? format(data.departureDate, 'MMMM dd, yyyy') : 'Not specified';
    const returnDate = data.returnDate ? format(data.returnDate, 'MMMM dd, yyyy') : 'Not specified';
    
    let plan = `📋 **Trip Plan Request**\n\n`;
    plan += `🚗 **Transportation:** ${transport}\n`;
    plan += `📅 **Travel Dates:** ${departure} - ${returnDate}\n`;
    plan += `🏠 **R&Q Provided:** ${data.rnqProvided ? 'Yes' : 'No'}\n`;
    plan += `✅ **Travel Authority:** ${data.travelAuthority ? 'Obtained' : 'Not Obtained'}\n`;
    plan += `🎯 **Purpose:** ${data.purpose || 'Not specified'}\n`;
    plan += `📍 **Route:** ${data.departureLocation || 'Not specified'} → ${data.arrivalLocation || 'Not specified'}\n`;
    
    if (distanceData) {
      plan += `📏 **Distance:** ${distanceData.distance.text}\n`;
      plan += `⏱️ **Estimated Travel Time:** ${distanceData.duration.text}\n`;
    }
    
    if (data.additionalNotes) {
      plan += `\n**Additional Details:** ${data.additionalNotes}`;
    }
    
    return plan;
  };

  const isFormValid = () => {
    return (
      tripData.transportMethod &&
      tripData.departureDate &&
      tripData.returnDate &&
      tripData.departureLocation &&
      tripData.arrivalLocation &&
      tripData.purpose
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-[var(--background-secondary)] text-[var(--text)] h-10 w-10" title="Trip Planner">
        <MapIcon size={18} />
      </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Trip Planner</SheetTitle>
                <SheetDescription>
                  Fill in your travel details to generate a formatted trip plan for your chat.
                </SheetDescription>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                {/* Transport Method */}
                <div className="space-y-2">
                  <Label htmlFor="transport">Method of Transport *</Label>
                  <Select
                    value={tripData.transportMethod}
                    onValueChange={(value) => setTripData({ ...tripData, transportMethod: value })}
                  >
                    <SelectTrigger id="transport">
                      <SelectValue placeholder="Select transport method" />
                    </SelectTrigger>
                    <SelectContent>
                      {transportMethods.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Travel Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Departure Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !tripData.departureDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {tripData.departureDate ? (
                            format(tripData.departureDate, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={tripData.departureDate}
                          onSelect={(date) => setTripData({ ...tripData, departureDate: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Return Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !tripData.returnDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {tripData.returnDate ? (
                            format(tripData.returnDate, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={tripData.returnDate}
                          onSelect={(date) => setTripData({ ...tripData, returnDate: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Locations */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="departure-location">Departure Location *</Label>
                    <Input
                      id="departure-location"
                      placeholder="e.g., CFB Toronto"
                      value={tripData.departureLocation}
                      onChange={(e) => setTripData({ ...tripData, departureLocation: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="arrival-location">Arrival Location *</Label>
                    <Input
                      id="arrival-location"
                      placeholder="e.g., CFB Ottawa"
                      value={tripData.arrivalLocation}
                      onChange={(e) => setTripData({ ...tripData, arrivalLocation: e.target.value })}
                    />
                  </div>
                  
                  {/* Distance Information */}
                  {(isLoadingDistance || distanceData || distanceError) && (
                    <div className="mt-4 p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
                      {isLoadingDistance && (
                        <div className="flex items-center text-sm text-[var(--text-secondary)]">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--text)] mr-2"></div>
                          Calculating distance...
                        </div>
                      )}
                      
                      {distanceData && !isLoadingDistance && (
                        <div className="space-y-1">
                          <div className="flex items-center text-sm">
                            <span className="font-medium">Distance:</span>
                            <span className="ml-2">{distanceData.distance.text}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="font-medium">Travel Time:</span>
                            <span className="ml-2">{distanceData.duration.text}</span>
                          </div>
                        </div>
                      )}
                      
                      {distanceError && !isLoadingDistance && (
                        <div className="text-sm text-red-500">
                          ⚠️ {distanceError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Checkboxes */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="rnq"
                      checked={tripData.rnqProvided}
                      onCheckedChange={(checked) => 
                        setTripData({ ...tripData, rnqProvided: !!checked })
                      }
                    />
                    <Label
                      htmlFor="rnq"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Rations & Quarters (R&Q) Provided
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="authority"
                      checked={tripData.travelAuthority}
                      onCheckedChange={(checked) => 
                        setTripData({ ...tripData, travelAuthority: !!checked })
                      }
                    />
                    <Label
                      htmlFor="authority"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Travel Authority Obtained
                    </Label>
                  </div>
                </div>

                {/* Purpose of Travel */}
                <div className="space-y-2">
                  <Label htmlFor="purpose">Purpose of Travel *</Label>
                  <Textarea
                    id="purpose"
                    placeholder="e.g., Annual training conference, Medical appointment, etc."
                    value={tripData.purpose}
                    onChange={(e) => setTripData({ ...tripData, purpose: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Additional Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional details or requirements..."
                    value={tripData.additionalNotes}
                    onChange={(e) => setTripData({ ...tripData, additionalNotes: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-2 pt-4">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={!isFormValid()}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Generate Trip Plan
                  </Button>
                </div>
              </div>
            </SheetContent>
    </Sheet>
  );
};