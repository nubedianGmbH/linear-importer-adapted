import fs from 'fs/promises';

const readSuccessfulImports = async (teamName) => {
  try {
    const filePath = `../log/${teamName}_successful_imports.csv`;
    
    try {
      await fs.access(filePath);
    } catch {
      // If file doesn't exist, return empty set
      return new Set();
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').slice(1); // Skip header row
    
    // Create Set of successfully imported IDs
    return new Set(
      lines
        .filter(line => line.trim()) // Remove empty lines
        .map(line => line.split(',')[1]) // Get ID from CSV
    );
  } catch (error) {
    console.error('Error reading successful imports:', error);
    return new Set();
  }
};

export default readSuccessfulImports;