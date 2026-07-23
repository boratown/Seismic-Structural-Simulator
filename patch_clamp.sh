sed -i 's/\/\/ Visual Safety Clamp: prevent sinking below Three.js ground surface visually!/\/\/ Removed clamp/g' src/components/SimulatorCanvas.tsx
sed -i 's/if (y3d < 0) {/if (false) {/g' src/components/SimulatorCanvas.tsx
