import React from 'react';

const AppTitle: React.FC = () => {
  return (
    <>
      <img 
        src="/assets/app-title-light.png" 
        alt="App Title" 
        width="196" 
        height="40" 
        className="w-[196px] h-10 dark:hidden"
      />
      <img 
        src="/assets/app-title-dark.png" 
        alt="App Title" 
        width="196" 
        height="40" 
        className="w-[196px] h-10 hidden dark:block"
      />
    </>
  );
};

export default AppTitle;