import { RootConfig } from './projenrc/RootConfig';
import { PipelineConfig } from './projenrc/PipelineConfig';
import { CLIConfig } from './projenrc/CLIConfig';
import { ProjenConfig } from './projenrc/ProjenConfig';

// Create root configuration
const root = new RootConfig();

// Create pipeline configuration
new PipelineConfig(root);

// Create CLI configuration
new CLIConfig(root);

// Create Projen configuration
new ProjenConfig(root);

root.synth();
