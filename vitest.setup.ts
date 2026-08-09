import { config } from 'dotenv';

import '@testing-library/jest-dom/vitest';

config();
config({ path: '.env.local', override: true });
