import React from 'react';

interface AppIconLightProps {
  className?: string;
}

const AppIconLight: React.FC<AppIconLightProps> = ({ className = '' }) => {
  return (
    <img 
      src="/assets/app-icon-light.png" 
      alt="ScanItKnowIt App Icon" 
      width="48" 
      height="48" 
      className={`w-12 h-12 ${className}`}
    />
  );
};

export default AppIconLight;