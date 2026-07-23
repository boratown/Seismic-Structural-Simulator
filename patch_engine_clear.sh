sed -i 's/Matter.Composite.clear(physicsWorld, false);/Matter.Composite.clear(physicsWorld, false);\n      Matter.Engine.clear(physicsEngine);/g' src/components/SimulatorCanvas.tsx
