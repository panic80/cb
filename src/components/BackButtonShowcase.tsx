import React from 'react';
import { EnhancedBackButton } from './ui/enhanced-back-button';
import { BackButton } from './ui/back-button';

export const BackButtonShowcase: React.FC = () => {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Enhanced Back Button Showcase</h1>
          <p className="text-muted-foreground">Modern back button designs with various effects</p>
        </div>

        {/* Current Back Button */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold mb-6">Current Back Button</h2>
          <div className="flex flex-wrap gap-4 items-center p-6 bg-muted/20 rounded-lg">
            <BackButton to="/" label="Back" />
            <BackButton to="/" label="Back to Home" size="lg" />
          </div>
        </div>

        {/* Enhanced Variants */}
        <div className="space-y-8">
          <h2 className="text-2xl font-semibold mb-6">Enhanced Back Button Variants</h2>

          {/* Magnetic Effect */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-muted-foreground">Magnetic Effect</h3>
            <div className="flex flex-wrap gap-6 items-center p-6 bg-muted/20 rounded-lg">
              <EnhancedBackButton variant="magnetic" size="sm" />
              <EnhancedBackButton variant="magnetic" />
              <EnhancedBackButton variant="magnetic" size="lg" />
              <EnhancedBackButton variant="magnetic" label="Home" showHome />
            </div>
          </div>

          {/* 3D Effect */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-muted-foreground">3D Shadow Effect</h3>
            <div className="flex flex-wrap gap-6 items-center p-6 bg-muted/20 rounded-lg">
              <EnhancedBackButton variant="3d" size="sm" />
              <EnhancedBackButton variant="3d" />
              <EnhancedBackButton variant="3d" size="lg" />
              <EnhancedBackButton variant="3d" label="Go Back" />
            </div>
          </div>

          {/* Glow Effect */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-muted-foreground">Glow Effect</h3>
            <div className="flex flex-wrap gap-6 items-center p-6 bg-muted/20 rounded-lg">
              <EnhancedBackButton variant="glow" size="sm" />
              <EnhancedBackButton variant="glow" />
              <EnhancedBackButton variant="glow" size="lg" />
              <EnhancedBackButton variant="glow" label="Return" />
            </div>
          </div>

          {/* Flow Effect */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-muted-foreground">Flow Effect</h3>
            <div className="flex flex-wrap gap-6 items-center p-6 bg-muted/20 rounded-lg">
              <EnhancedBackButton variant="flow" size="sm" />
              <EnhancedBackButton variant="flow" />
              <EnhancedBackButton variant="flow" size="lg" />
              <EnhancedBackButton variant="flow" label="Navigate Back" />
            </div>
          </div>

          {/* Minimal */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-muted-foreground">Minimal</h3>
            <div className="flex flex-wrap gap-6 items-center p-6 bg-muted/20 rounded-lg">
              <EnhancedBackButton variant="minimal" size="sm" />
              <EnhancedBackButton variant="minimal" />
              <EnhancedBackButton variant="minimal" size="lg" />
              <EnhancedBackButton variant="minimal" label="Go Back" />
            </div>
          </div>
        </div>

        {/* Dark Mode Test */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold mb-6">Dark Background Test</h2>
          <div className="p-8 bg-black rounded-lg space-y-4">
            <div className="flex flex-wrap gap-4">
              <EnhancedBackButton variant="magnetic" />
              <EnhancedBackButton variant="3d" />
              <EnhancedBackButton variant="glow" />
              <EnhancedBackButton variant="flow" />
              <EnhancedBackButton variant="minimal" />
            </div>
          </div>
        </div>

        {/* Usage Examples */}
        <div className="space-y-4 border-t pt-8">
          <h2 className="text-2xl font-semibold mb-6">Usage Examples</h2>
          <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-sm">
{`// Magnetic effect (default)
<EnhancedBackButton to="/" label="Back" />

// 3D shadow effect
<EnhancedBackButton variant="3d" size="lg" />

// Glow effect with home icon
<EnhancedBackButton variant="glow" showHome />

// Flow effect with custom label
<EnhancedBackButton variant="flow" label="Return to Dashboard" />

// Minimal style
<EnhancedBackButton variant="minimal" />

// Custom click handler
<EnhancedBackButton onClick={() => console.log('Custom action')} />`}
          </pre>
        </div>
      </div>
    </div>
  );
};