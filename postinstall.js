const { execSync } = require('child_process');

console.log('Installing Tailwind CSS...');

try {
  execSync('npm install -D tailwindcss postcss autoprefixer', { stdio: 'inherit' });
  execSync('npx tailwindcss init -p', { stdio: 'inherit' });
  console.log('Tailwind CSS installed successfully!');
} catch (error) {
  console.error('Error installing Tailwind CSS:', error.message);
} 