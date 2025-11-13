import React from 'react';

interface AppIconDarkProps {
  className?: string;
}

const AppIconDark: React.FC<AppIconDarkProps> = ({ className = '' }) => {
  return (
    <img 
      src="/assets/app-icon-dark.png" 
      alt="App Icon" 
      width="32" 
      height="32" 
      className={`w-8 h-8 ${className}`}
    />
  );
};

export default AppIconDark;