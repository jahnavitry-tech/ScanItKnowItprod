import React from 'react';

const AppTitle: React.FC = () => {
  return (
    <>
      <img 
        src="/assets/app-title.png" 
        alt="App Title" 
        width="240" 
        height="42" 
        className="w-60 h-10 dark:hidden"
      />
      <img 
        src="/assets/app-title-dark.png" 
        alt="App Title" 
        width="240" 
        height="42" 
        className="w-60 h-10 hidden dark:block"
      />
    </>
  );
};

export default AppTitle;