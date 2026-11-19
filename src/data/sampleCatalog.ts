import type { CatalogProduct, CourseLesson } from '../utils/commerceRules';

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  group: 'technology';
  active: boolean;
}

export interface CourseCurriculumDetails {
  id: string;
  productId: string;
  title: string;
  instructor: string;
  language: string;
  level: string;
  duration: string;
  introduction: string;
  syllabusSummary: string;
  status: 'published' | 'draft' | 'archived';
}

export interface PromotionalBanner {
  id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  couponCode: string;
  discountPercent: number;
  active: boolean;
}

export const INITIAL_CATEGORIES: CategoryItem[] = [
  { id: 'cat-python', name: 'Python', slug: 'python', description: 'Core Python 3.12, async programming, data structures, and automation.', group: 'technology', active: true },
  { id: 'cat-django', name: 'Django', slug: 'django', description: 'Production web APIs, ORM architecture, security, and scalable backends.', group: 'technology', active: true },
  { id: 'cat-html', name: 'HTML', slug: 'html', description: 'Semantic HTML5, accessibility standards, and modern document structure.', group: 'technology', active: true },
  { id: 'cat-css', name: 'CSS', slug: 'css', description: 'Responsive Grid, Flexbox, Tailwind CSS, and fluid layout architecture.', group: 'technology', active: true },
  { id: 'cat-javascript', name: 'JavaScript', slug: 'javascript', description: 'ES2025+, event loop, closures, TypeScript, and browser APIs.', group: 'technology', active: true },
  { id: 'cat-react', name: 'React', slug: 'react', description: 'React 19, hooks, state management, and high-performance web apps.', group: 'technology', active: true },
  { id: 'cat-sql', name: 'SQL', slug: 'sql', description: 'Relational modeling, query indexing, transactions, and PostgreSQL.', group: 'technology', active: true },
  { id: 'cat-aws', name: 'AWS', slug: 'aws', description: 'Cloud architecture, IAM security, serverless compute, and storage.', group: 'technology', active: true },
  { id: 'cat-devops', name: 'DevOps', slug: 'devops', description: 'CI/CD pipelines, Docker containers, Linux administration, and monitoring.', group: 'technology', active: true },
  { id: 'cat-genai', name: 'GenAI', slug: 'genai', description: 'Large Language Models, prompt engineering, RAG pipelines, and embeddings.', group: 'technology', active: true },
  { id: 'cat-agentic-ai', name: 'Agentic AI', slug: 'agentic-ai', description: 'Multi-step tool-calling agents, memory architectures, and evaluation.', group: 'technology', active: true },
];

export const INITIAL_BANNERS: PromotionalBanner[] = [
  {
    id: 'banner-launch-offer',
    title: 'Academic Offer: Save 20% on Online Technology Courses',
    subtitle: 'Apply code SATYA20 at checkout for instant lifetime access to HD course recordings, projects, and downloadable code notes.',
    ctaText: 'Explore Courses',
    ctaLink: 'courses',
    couponCode: 'SATYA20',
    discountPercent: 20,
    active: true,
  },
];

export const INITIAL_PRODUCTS: CatalogProduct[] = [
  {
    id: 'course-react-typescript',
    title: 'Modern React 19, TypeScript & Tailwind CSS Workshop',
    slug: 'modern-react-typescript-tailwind',
    type: 'course',
    category: 'React',
    priceInr: 10000,
    originalPriceInr: 15000,
    language: 'English',
    format: 'recorded_course',
    stock: 9999,
    featured: true,
    status: 'published',
    authorOrInstructor: 'Satya Narayana',
    shortDescription: 'Comprehensive online course on accessible component systems, responsive design with Tailwind CSS, and state management.',
    description: 'Master component composition, accessible forms, custom hooks, and responsive design patterns that work seamlessly across mobile phones, tablets, and desktops.',
    coverType: 'HD Recorded Course (4 Modules)',
    level: 'Intermediate',
    duration: '22 Hours',
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    id: 'course-aws-devops',
    title: 'AWS Cloud & DevOps CI/CD Foundations',
    slug: 'aws-cloud-devops-cicd-foundations',
    type: 'course',
    category: 'AWS',
    priceInr: 10000,
    originalPriceInr: 15000,
    language: 'English',
    format: 'recorded_course',
    stock: 9999,
    featured: false,
    status: 'published',
    authorOrInstructor: 'Satya Narayana',
    shortDescription: 'Industry-ready online training on Linux, Docker containers, GitHub Actions, and AWS core infrastructure.',
    description: 'Understand containerization, automated testing pipelines, least-privilege IAM roles, and zero-downtime deployment workflows.',
    coverType: 'HD Recorded Course (4 Modules)',
    level: 'Beginner to Intermediate',
    duration: '20 Hours',
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  },
  {
    id: 'course-python-mastery',
    title: 'Complete Python 3.12 & Backend Engineering Mastery',
    slug: 'complete-python-backend-mastery',
    type: 'course',
    category: 'Python',
    priceInr: 20000,
    originalPriceInr: 25000,
    language: 'English & Telugu',
    format: 'recorded_course',
    stock: 9999,
    featured: true,
    status: 'published',
    authorOrInstructor: 'Satya Narayana',
    shortDescription: 'Comprehensive self-paced online course covering Python fundamentals, object-oriented design, async I/O, and automated testing.',
    description: 'This comprehensive course provides a structured curriculum in Python 3.12. Students build command-line utilities, data processing pipelines, and modular packages with full HD video recordings and downloadable code notes.',
    coverType: 'HD Recorded Course (6 Modules)',
    level: 'Beginner to Advanced',
    duration: '36 Hours',
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    id: 'course-django-fullstack',
    title: 'Production Django 5, REST APIs & Cloud Deployment',
    slug: 'production-django-rest-apis',
    type: 'course',
    category: 'Django',
    priceInr: 20000,
    originalPriceInr: 28000,
    language: 'English',
    format: 'recorded_course',
    stock: 9999,
    featured: true,
    status: 'published',
    authorOrInstructor: 'Satya Narayana',
    shortDescription: 'Comprehensive online course on Django ORM, authentication, API security, PostgreSQL, and cloud deployment.',
    description: 'Learn how to architect secure, maintainable Django web applications and RESTful backends. Includes dedicated modules on token authentication, role-based access control, and relational schema design.',
    coverType: 'HD Recorded Course (5 Modules)',
    level: 'Intermediate',
    duration: '28 Hours',
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    id: 'course-agentic-ai',
    title: 'Building GenAI & Agentic AI Workflows with Python',
    slug: 'building-genai-agentic-ai-workflows',
    type: 'course',
    category: 'Agentic AI',
    priceInr: 50000,
    originalPriceInr: 65000,
    language: 'English',
    format: 'recorded_course',
    stock: 9999,
    featured: true,
    status: 'published',
    authorOrInstructor: 'Satya Narayana',
    shortDescription: 'Flagship online program covering tool-calling agents, structured outputs, retrieval-augmented generation, and safety guardrails.',
    description: 'Explore the engineering foundations of Generative AI and multi-step Agentic workflows. Covers deterministic evaluation, prompt architecture, and reliable API orchestration for enterprise production.',
    coverType: 'HD Recorded Program (8 Modules)',
    level: 'Advanced',
    duration: '48 Hours',
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  },
  {
    id: 'course-fullstack-ai-architect',
    title: 'Enterprise Full-Stack Systems, SQL & GenAI Architect Program',
    slug: 'enterprise-fullstack-sql-genai-architect',
    type: 'course',
    category: 'GenAI',
    priceInr: 50000,
    originalPriceInr: 65000,
    language: 'English & Telugu',
    format: 'recorded_course',
    stock: 9999,
    featured: true,
    status: 'published',
    authorOrInstructor: 'Satya Narayana',
    shortDescription: 'End-to-end flagship mastery combining Python, Django, React, PostgreSQL indexing, AWS DevOps, and production GenAI systems.',
    description: 'Our complete career-ready engineering program covering full-stack architecture, high-throughput SQL design, container orchestration on AWS, and deploying reliable AI-powered applications.',
    coverType: 'HD Recorded Program (10 Modules)',
    level: 'Beginner to Advanced',
    duration: '64 Hours',
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
];

export const INITIAL_COURSE_DETAILS: Record<string, CourseCurriculumDetails> = {
  'course-python-mastery': {
    id: 'course-python-mastery',
    productId: 'course-python-mastery',
    title: 'Complete Python 3.12 & Backend Engineering Mastery',
    instructor: 'Satya Narayana',
    language: 'English & Telugu',
    level: 'Beginner to Advanced',
    duration: '36 Hours',
    introduction:
      'Welcome to this recorded course. Designed for aspiring software engineers and university students, every module pairs clear conceptual whiteboarding with live coding sessions.',
    syllabusSummary:
      'Module 1: Python Runtime, Types & Memory Model · Module 2: Functions, Iterators & Type Annotations · Module 3: Object-Oriented Architecture & Testing · Module 4: Asyncio, File Systems & CLI Tooling.',
    status: 'published',
  },
  'course-django-fullstack': {
    id: 'course-django-fullstack',
    productId: 'course-django-fullstack',
    title: 'Production Django 5, REST APIs & Cloud Deployment',
    instructor: 'Satya Narayana',
    language: 'English',
    level: 'Intermediate',
    duration: '28 Hours',
    introduction:
      'A practical engineering course focused on building secure backend web services with Python and Django, complete with token authentication and API architecture.',
    syllabusSummary:
      'Module 1: HTTP, Middleware & URL Routing · Module 2: Relational Modeling & Query Optimization · Module 3: Token Authentication & RBAC Security · Module 4: Production Deployment & Monitoring.',
    status: 'published',
  },
  'course-react-typescript': {
    id: 'course-react-typescript',
    productId: 'course-react-typescript',
    title: 'Modern React 19, TypeScript & Tailwind CSS Workshop',
    instructor: 'Satya Narayana',
    language: 'English',
    level: 'Intermediate',
    duration: '22 Hours',
    introduction:
      'Build accessible, responsive interfaces from scratch using strict TypeScript and Tailwind CSS.',
    syllabusSummary:
      'Module 1: TypeScript Foundations for UI · Module 2: Component State & Effects · Module 3: Responsive Grids & Accessibility · Module 4: Full-Stack API Integration.',
    status: 'published',
  },
  'course-agentic-ai': {
    id: 'course-agentic-ai',
    productId: 'course-agentic-ai',
    title: 'Building GenAI & Agentic AI Workflows with Python',
    instructor: 'Satya Narayana',
    language: 'English',
    level: 'Advanced',
    duration: '48 Hours',
    introduction:
      'Learn how modern AI engineers design deterministic tool-calling pipelines, structured schemas, and evaluation harnesses.',
    syllabusSummary:
      'Module 1: Structured Generation & Schemas · Module 2: Retrieval & Vector Indexing · Module 3: Tool-Calling Agent Loops · Module 4: Safety, Guardrails & Production Evals.',
    status: 'published',
  },
  'course-aws-devops': {
    id: 'course-aws-devops',
    productId: 'course-aws-devops',
    title: 'AWS Cloud & DevOps CI/CD Foundations',
    instructor: 'Satya Narayana',
    language: 'English',
    level: 'Beginner to Intermediate',
    duration: '20 Hours',
    introduction:
      'Step-by-step comprehensive course covering Linux server essentials, container workflows, and cloud security.',
    syllabusSummary:
      'Module 1: Linux & Shell Scripting · Module 2: Docker & Multi-Stage Builds · Module 3: CI/CD Pipelines · Module 4: AWS IAM, Storage & Monitoring.',
    status: 'published',
  },
  'course-fullstack-ai-architect': {
    id: 'course-fullstack-ai-architect',
    productId: 'course-fullstack-ai-architect',
    title: 'Enterprise Full-Stack Systems, SQL & GenAI Architect Program',
    instructor: 'Satya Narayana',
    language: 'English & Telugu',
    level: 'Beginner to Advanced',
    duration: '64 Hours',
    introduction:
      'An intensive flagship online program taking learners from foundational backend design through production React, PostgreSQL tuning, AWS deployment, and applied GenAI engineering.',
    syllabusSummary:
      'Module 1: System Design & Python Core · Module 2: Django APIs & PostgreSQL Indexing · Module 3: React 19 & TypeScript Frontends · Module 4: AWS DevOps & GenAI Agent Integration.',
    status: 'published',
  },
};

export const INITIAL_LESSONS: CourseLesson[] = [
  {
    id: 'lesson-py-1',
    courseId: 'course-python-mastery',
    moduleTitle: 'Module 1: Python Runtime & Core Foundations',
    title: '01. Course Overview & Python 3.12 Memory Model (Free Preview)',
    orderIndex: 1,
    durationMinutes: 18,
    isFreePreview: true,
    videoStoragePath: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    notes: 'Free preview lesson covering how Python objects, references, and stack frames operate under the hood.',
  },
  {
    id: 'lesson-py-2',
    courseId: 'course-python-mastery',
    moduleTitle: 'Module 1: Python Runtime & Core Foundations',
    title: '02. Collections, Comprehensions & Generator Pipelines',
    orderIndex: 2,
    durationMinutes: 34,
    isFreePreview: false,
    videoStoragePath: 'protected/courses/course-python-mastery/lesson-02.mp4',
    notes: 'Deep dive into memory-efficient generators, dictionary internals, and time complexity.',
  },
  {
    id: 'lesson-py-3',
    courseId: 'course-python-mastery',
    moduleTitle: 'Module 2: Modular Architecture & Testing',
    title: '03. Dataclasses, Type Hints & Unit Testing with pytest',
    orderIndex: 3,
    durationMinutes: 42,
    isFreePreview: false,
    videoStoragePath: 'protected/courses/course-python-mastery/lesson-03.mp4',
    notes: 'Writing maintainable domain logic with static type checking and deterministic tests.',
  },
  {
    id: 'lesson-dj-1',
    courseId: 'course-django-fullstack',
    moduleTitle: 'Module 1: Django Architecture & Request Lifecycle',
    title: '01. Inside WSGI/ASGI, Middleware & Clean Settings (Free Preview)',
    orderIndex: 1,
    durationMinutes: 21,
    isFreePreview: true,
    videoStoragePath: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    notes: 'Free preview exploring environment variable separation and request security middleware.',
  },
  {
    id: 'lesson-dj-2',
    courseId: 'course-django-fullstack',
    moduleTitle: 'Module 2: Authentication & API Security',
    title: '02. Role-Based Access Control & REST API Validation in Django',
    orderIndex: 2,
    durationMinutes: 46,
    isFreePreview: false,
    videoStoragePath: 'protected/courses/course-django-fullstack/lesson-02.mp4',
    notes: 'Implementing clean authentication middleware and idempotent order fulfillment.',
  },
  {
    id: 'lesson-react-1',
    courseId: 'course-react-typescript',
    moduleTitle: 'Module 1: Component Systems',
    title: '01. Semantic HTML, Accessibility Tree & Tailwind Foundations (Free Preview)',
    orderIndex: 1,
    durationMinutes: 19,
    isFreePreview: true,
    videoStoragePath: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    notes: 'Free preview lesson on designing accessible, keyboard-friendly React components.',
  },
  {
    id: 'lesson-react-2',
    courseId: 'course-react-typescript',
    moduleTitle: 'Module 2: State & Data Fetching',
    title: '02. Async State Management & Optimistic UI Patterns',
    orderIndex: 2,
    durationMinutes: 38,
    isFreePreview: false,
    videoStoragePath: 'protected/courses/course-react-typescript/lesson-02.mp4',
    notes: 'Handling loading, empty, and error states cleanly.',
  },
  {
    id: 'lesson-ai-1',
    courseId: 'course-agentic-ai',
    moduleTitle: 'Module 1: Foundations of Agentic Systems',
    title: '01. Deterministic Tool Calling & Schema Validation (Free Preview)',
    orderIndex: 1,
    durationMinutes: 24,
    isFreePreview: true,
    videoStoragePath: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    notes: 'Free preview lesson on structured outputs and safe tool execution loops.',
  },
  {
    id: 'lesson-ai-2',
    courseId: 'course-agentic-ai',
    moduleTitle: 'Module 2: Memory & Evaluation',
    title: '02. Multi-Turn Context Compaction & Automated Evals',
    orderIndex: 2,
    durationMinutes: 41,
    isFreePreview: false,
    videoStoragePath: 'protected/courses/course-agentic-ai/lesson-02.mp4',
    notes: 'Measuring latency, accuracy, and hallucination rates across test suites.',
  },
  {
    id: 'lesson-aws-1',
    courseId: 'course-aws-devops',
    moduleTitle: 'Module 1: Cloud & Container Basics',
    title: '01. Docker Multi-Stage Builds & Least-Privilege IAM (Free Preview)',
    orderIndex: 1,
    durationMinutes: 16,
    isFreePreview: true,
    videoStoragePath: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    notes: 'Free preview lesson on packaging Python and Node applications securely.',
  },
  {
    id: 'lesson-arch-1',
    courseId: 'course-fullstack-ai-architect',
    moduleTitle: 'Module 1: End-to-End Architecture Blueprint',
    title: '01. Designing Resilient Full-Stack & AI Applications (Free Preview)',
    orderIndex: 1,
    durationMinutes: 26,
    isFreePreview: true,
    videoStoragePath: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    notes: 'Free preview outlining database scaling, API security, and structured AI pipelines.',
  },
  {
    id: 'lesson-arch-2',
    courseId: 'course-fullstack-ai-architect',
    moduleTitle: 'Module 2: PostgreSQL Indexing & Production Deployments',
    title: '02. Query Planning, Composite Indexes & Zero-Downtime Releases',
    orderIndex: 2,
    durationMinutes: 48,
    isFreePreview: false,
    videoStoragePath: 'protected/courses/course-fullstack-ai-architect/lesson-02.mp4',
    notes: 'Hands-on walkthrough of EXPLAIN ANALYZE, connection pooling, and automated rollouts.',
  },
];
