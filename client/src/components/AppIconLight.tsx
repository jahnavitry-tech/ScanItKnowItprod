import React from 'react';

interface AppIconLightProps {
  className?: string;
}

const AppIconLight: React.FC<AppIconLightProps> = ({ className = '' }) => {
  return (
    <img 
      src="/assets/app-icon-light.png" 
      alt="App Icon" 
      width="32" 
      height="32" 
      className={`w-8 h-8 ${className}`}
    />
  );
};

export default AppIconLight;