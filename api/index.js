// src/serverApp.ts
import express from "express";
import crypto2 from "node:crypto";
import dotenv from "dotenv";

// src/utils/commerceRules.ts
var BOOTSTRAPPED_ADMIN_EMAIL = "tarunpediredla9966@gmail.com";
var ID_REGEX = /^[a-zA-Z0-9_-]+$/;
function isValidDocumentId(id) {
  return typeof id === "string" && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}
function canUserPerformAdminOperation(auth) {
  if (!auth || !auth.uid) return false;
  if (auth.customClaims?.admin === true && auth.emailVerified === true) {
    return true;
  }
  if (auth.emailVerified === true && auth.email === BOOTSTRAPPED_ADMIN_EMAIL) {
    return true;
  }
  if (auth.emailVerified === true && auth.isAdminRecordPresent === true) {
    return true;
  }
  return false;
}
function canUserAccessProtectedContent(params) {
  if (params.isFreePreview === true) {
    return { allowed: true, reason: "free_preview" };
  }
  if (!params.auth || !params.auth.uid) {
    return { allowed: false, reason: "unauthenticated" };
  }
  if (canUserPerformAdminOperation(params.auth)) {
    return { allowed: true, reason: "admin_override" };
  }
  const entitledSet = params.entitledProductIds instanceof Set ? params.entitledProductIds : new Set(params.entitledProductIds);
  if (entitledSet.has(params.productId)) {
    return { allowed: true, reason: "verified_entitlement" };
  }
  return { allowed: false, reason: "purchase_required" };
}
function calculateVerifiedCartSummary(params) {
  const { cartItems, couponCode, activeCoupons = {}, shippingAddressProvided = false } = params;
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return {
      valid: false,
      error: "Your cart is empty.",
      items: [],
      subtotalInr: 0,
      discountInr: 0,
      shippingInr: 0,
      totalAmountInr: 0,
      hasPhysicalItems: false
    };
  }
  const getProduct = (id) => {
    if (params.catalogById instanceof Map) {
      return params.catalogById.get(id);
    }
    return params.catalogById[id];
  };
  const verifiedItems = [];
  let subtotalInr = 0;
  let hasPhysicalItems = false;
  for (const rawItem of cartItems) {
    if (!rawItem || !isValidDocumentId(rawItem.productId)) {
      return {
        valid: false,
        error: "Invalid product identifier in cart.",
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false
      };
    }
    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return {
        valid: false,
        error: "Invalid item quantity. Quantity must be an integer between 1 and 20.",
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false
      };
    }
    const product = getProduct(rawItem.productId);
    if (!product || product.status !== "published") {
      return {
        valid: false,
        error: `Product "${rawItem.productId}" is unavailable or unpublished.`,
        items: [],
        subtotalInr: 0,
        discountInr: 0,
        shippingInr: 0,
        totalAmountInr: 0,
        hasPhysicalItems: false
      };
    }
    const requiresShipping = product.format === "physical_book" || product.format === "hybrid_book";
    if (requiresShipping) {
      hasPhysicalItems = true;
      if (product.stock < quantity) {
        return {
          valid: false,
          error: `"${product.title}" only has ${product.stock} copy(s) in stock.`,
          items: [],
          subtotalInr: 0,
          discountInr: 0,
          shippingInr: 0,
          totalAmountInr: 0,
          hasPhysicalItems: true
        };
      }
    }
    const effectiveQty = product.format === "recorded_course" ? 1 : quantity;
    const unitPriceInr = product.priceInr;
    const lineTotalInr = unitPriceInr * effectiveQty;
    verifiedItems.push({
      productId: product.id,
      title: product.title,
      type: product.type,
      format: product.format,
      unitPriceInr,
      quantity: effectiveQty,
      lineTotalInr,
      requiresShipping
    });
    subtotalInr += lineTotalInr;
  }
  if (hasPhysicalItems && !shippingAddressProvided) {
    return {
      valid: false,
      error: "A delivery address is required for physical books in your cart.",
      items: verifiedItems,
      subtotalInr,
      discountInr: 0,
      shippingInr: 0,
      totalAmountInr: subtotalInr,
      hasPhysicalItems: true
    };
  }
  let discountInr = 0;
  if (couponCode && couponCode.trim().length > 0) {
    const normalizedCode = couponCode.trim().toUpperCase();
    const pct = activeCoupons[normalizedCode];
    if (typeof pct === "number" && pct > 0 && pct <= 90) {
      discountInr = Math.round(subtotalInr * pct / 100);
    }
  }
  const discountedSubtotal = Math.max(0, subtotalInr - discountInr);
  const shippingInr = hasPhysicalItems ? discountedSubtotal >= 999 ? 0 : 79 : 0;
  const totalAmountInr = discountedSubtotal + shippingInr;
  return {
    valid: true,
    items: verifiedItems,
    subtotalInr,
    discountInr,
    shippingInr,
    totalAmountInr,
    hasPhysicalItems
  };
}
function evaluateOrderWebhookTransition(params) {
  const { order, cashfreePaymentStatus, paidAmountInr, cashfreePaymentId } = params;
  if (order.paymentStatus === "paid") {
    return {
      shouldUpdateOrder: false,
      shouldGrantEntitlements: false,
      shouldDecrementStock: false,
      alreadyProcessed: true,
      nextPaymentStatus: "paid",
      nextShipmentStatus: order.shipmentStatus,
      reason: "Order is already marked paid; duplicate webhook safely ignored."
    };
  }
  if (order.paymentStatus === "refunded") {
    return {
      shouldUpdateOrder: false,
      shouldGrantEntitlements: false,
      shouldDecrementStock: false,
      alreadyProcessed: true,
      nextPaymentStatus: "refunded",
      nextShipmentStatus: order.shipmentStatus,
      reason: "Order is already refunded; terminal state locked."
    };
  }
  if (cashfreePaymentStatus === "SUCCESS") {
    if (Math.round(paidAmountInr) !== order.totalAmountInr) {
      return {
        shouldUpdateOrder: true,
        shouldGrantEntitlements: false,
        shouldDecrementStock: false,
        alreadyProcessed: false,
        nextPaymentStatus: "failed",
        nextShipmentStatus: order.shipmentStatus,
        reason: `Amount mismatch: expected \u20B9${order.totalAmountInr}, received \u20B9${paidAmountInr}.`
      };
    }
    return {
      shouldUpdateOrder: true,
      shouldGrantEntitlements: true,
      shouldDecrementStock: order.hasPhysicalItems,
      alreadyProcessed: false,
      nextPaymentStatus: "paid",
      nextShipmentStatus: order.hasPhysicalItems ? "processing" : "not_applicable",
      reason: `Payment ${cashfreePaymentId} verified. Granting entitlements.`
    };
  }
  if (cashfreePaymentStatus === "FAILED") {
    return {
      shouldUpdateOrder: order.paymentStatus !== "failed",
      shouldGrantEntitlements: false,
      shouldDecrementStock: false,
      alreadyProcessed: order.paymentStatus === "failed",
      nextPaymentStatus: "failed",
      nextShipmentStatus: order.shipmentStatus,
      reason: "Payment reported as FAILED by Cashfree."
    };
  }
  if (cashfreePaymentStatus === "USER_DROPPED" || cashfreePaymentStatus === "CANCELLED") {
    return {
      shouldUpdateOrder: order.paymentStatus !== "cancelled",
      shouldGrantEntitlements: false,
      shouldDecrementStock: false,
      alreadyProcessed: order.paymentStatus === "cancelled",
      nextPaymentStatus: "cancelled",
      nextShipmentStatus: order.shipmentStatus,
      reason: "Payment cancelled or dropped by user."
    };
  }
  return {
    shouldUpdateOrder: false,
    shouldGrantEntitlements: false,
    shouldDecrementStock: false,
    alreadyProcessed: false,
    nextPaymentStatus: "pending",
    nextShipmentStatus: order.shipmentStatus,
    reason: "Payment remains pending."
  };
}

// src/utils/serverCrypto.ts
import crypto from "node:crypto";
function computeCashfreeWebhookSignature(timestamp, rawBody, secretKey) {
  return crypto.createHmac("sha256", secretKey).update(`${timestamp}${rawBody}`).digest("base64");
}
function verifyCashfreeWebhookSignature(params) {
  const { timestampHeader, signatureHeader, rawBody, secretKey } = params;
  if (!timestampHeader || !signatureHeader || !rawBody || !secretKey) {
    return false;
  }
  const expected = computeCashfreeWebhookSignature(timestampHeader, rawBody, secretKey);
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// src/data/sampleCatalog.ts
var INITIAL_CATEGORIES = [
  { id: "cat-python", name: "Python", slug: "python", description: "Core Python 3.12, async programming, data structures, and automation.", group: "technology", active: true },
  { id: "cat-django", name: "Django", slug: "django", description: "Production web APIs, ORM architecture, security, and scalable backends.", group: "technology", active: true },
  { id: "cat-html", name: "HTML", slug: "html", description: "Semantic HTML5, accessibility standards, and modern document structure.", group: "technology", active: true },
  { id: "cat-css", name: "CSS", slug: "css", description: "Responsive Grid, Flexbox, Tailwind CSS, and fluid layout architecture.", group: "technology", active: true },
  { id: "cat-javascript", name: "JavaScript", slug: "javascript", description: "ES2025+, event loop, closures, TypeScript, and browser APIs.", group: "technology", active: true },
  { id: "cat-react", name: "React", slug: "react", description: "React 19, hooks, state management, and high-performance web apps.", group: "technology", active: true },
  { id: "cat-sql", name: "SQL", slug: "sql", description: "Relational modeling, query indexing, transactions, and PostgreSQL.", group: "technology", active: true },
  { id: "cat-aws", name: "AWS", slug: "aws", description: "Cloud architecture, IAM security, serverless compute, and storage.", group: "technology", active: true },
  { id: "cat-devops", name: "DevOps", slug: "devops", description: "CI/CD pipelines, Docker containers, Linux administration, and monitoring.", group: "technology", active: true },
  { id: "cat-genai", name: "GenAI", slug: "genai", description: "Large Language Models, prompt engineering, RAG pipelines, and embeddings.", group: "technology", active: true },
  { id: "cat-agentic-ai", name: "Agentic AI", slug: "agentic-ai", description: "Multi-step tool-calling agents, memory architectures, and evaluation.", group: "technology", active: true },
  { id: "cat-eng-books", name: "Engineering Textbooks", slug: "engineering-textbooks", description: "Reference handbooks and practical guides for software engineers.", group: "books", active: true },
  { id: "cat-storybooks", name: "Children\u2019s Storybooks", slug: "childrens-storybooks", description: "Illustrated STEM, logic, and curiosity storybooks for young readers.", group: "storybooks", active: true }
];
var INITIAL_BANNERS = [
  {
    id: "banner-launch-offer",
    title: "Academic Offer: Save 20% on Courses & Technical Books",
    subtitle: "Apply code SATYA20 at checkout. Free shipping across India on physical book orders \u20B9999 and above.",
    ctaText: "Explore Catalog",
    ctaLink: "catalog",
    couponCode: "SATYA20",
    discountPercent: 20,
    active: true
  }
];
var INITIAL_PRODUCTS = [
  {
    id: "course-python-mastery",
    title: "Complete Python 3.12 & Backend Engineering Mastery",
    slug: "complete-python-backend-mastery",
    type: "course",
    category: "Python",
    priceInr: 1499,
    originalPriceInr: 2499,
    language: "English & Telugu",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive self-paced recorded course covering Python fundamentals, object-oriented design, async I/O, and automated testing.",
    description: "This comprehensive course provides a structured curriculum in Python 3.12. Students build command-line utilities, data processing pipelines, and modular packages with full HD video recordings and downloadable code notes.",
    coverType: "HD Recorded Course (6 Modules)",
    level: "Beginner to Advanced",
    duration: "36 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
  },
  {
    id: "course-django-fullstack",
    title: "Production Django 5, REST APIs & Cloud Deployment",
    slug: "production-django-rest-apis",
    type: "course",
    category: "Django",
    priceInr: 1899,
    originalPriceInr: 2999,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive recorded course on Django ORM, authentication, webhook security, payment gateways, and serverless deployment.",
    description: "Learn how to architect secure, maintainable Django web applications and RESTful backends. Includes dedicated modules on Firebase token verification, Cashfree webhook signature verification, and relational schema design.",
    coverType: "HD Recorded Course (5 Modules)",
    level: "Intermediate",
    duration: "28 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
  },
  {
    id: "course-react-typescript",
    title: "Modern React 19, TypeScript & Tailwind CSS Workshop",
    slug: "modern-react-typescript-tailwind",
    type: "course",
    category: "React",
    priceInr: 1299,
    originalPriceInr: 1999,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: false,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive course on accessible component systems, responsive design with Tailwind CSS, and state management.",
    description: "Master component composition, accessible forms, custom hooks, and responsive design patterns that work seamlessly across mobile phones, tablets, and desktops.",
    coverType: "HD Recorded Course (4 Modules)",
    level: "Intermediate",
    duration: "22 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  },
  {
    id: "course-agentic-ai",
    title: "Building GenAI & Agentic AI Workflows with Python",
    slug: "building-genai-agentic-ai-workflows",
    type: "course",
    category: "Agentic AI",
    priceInr: 2199,
    originalPriceInr: 3499,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive course covering tool-calling agents, structured outputs, retrieval-augmented generation, and safety guardrails.",
    description: "Explore the engineering foundations of Generative AI and multi-step Agentic workflows. Covers deterministic evaluation, prompt architecture, and reliable API orchestration.",
    coverType: "HD Recorded Course (5 Modules)",
    level: "Advanced",
    duration: "24 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
  },
  {
    id: "course-aws-devops",
    title: "AWS Cloud & DevOps CI/CD Foundations",
    slug: "aws-cloud-devops-cicd-foundations",
    type: "course",
    category: "AWS",
    priceInr: 1599,
    originalPriceInr: 2499,
    language: "English",
    format: "recorded_course",
    stock: 9999,
    featured: false,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Industry-ready recorded training on Linux, Docker containers, GitHub Actions, and AWS core infrastructure.",
    description: "Understand containerization, automated testing pipelines, least-privilege IAM roles, and zero-downtime deployment workflows.",
    coverType: "HD Recorded Course (4 Modules)",
    level: "Beginner to Intermediate",
    duration: "20 Hours",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
  },
  {
    id: "book-python-handbook-digital",
    title: "The Practical Python & SQL Engineering Handbook (Digital PDF)",
    slug: "practical-python-sql-handbook-digital",
    type: "book",
    category: "Python",
    priceInr: 499,
    originalPriceInr: 799,
    language: "English",
    format: "digital_book",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Authoritative downloadable digital textbook covering clean Python idioms, SQL indexing strategies, and debugging.",
    description: "Delivered as a protected digital PDF download upon verified purchase. Includes 320 pages of annotated code examples, query execution diagrams, and exercises.",
    coverType: "Digital PDF (320 Pages)",
    level: "All Levels",
    duration: "320 Pages",
    previewVideoUrl: ""
  },
  {
    id: "book-django-architecture-print",
    title: "Full-Stack Web Architecture with Django & React (Physical Hardcover)",
    slug: "fullstack-django-react-hardcover",
    type: "book",
    category: "Django",
    priceInr: 899,
    originalPriceInr: 1299,
    language: "English",
    format: "physical_book",
    stock: 18,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Authoritative physical hardcover edition shipped to your doorstep. Covers API security, database modeling, and payment flows.",
    description: "Printed on archival-grade paper with sewn hardcover binding. Requires a valid Indian delivery address at checkout and includes shipment status tracking in your dashboard.",
    coverType: "Physical Hardcover (410 Pages)",
    level: "Intermediate",
    duration: "410 Pages",
    previewVideoUrl: ""
  },
  {
    id: "book-genai-systems-hybrid",
    title: "Applied GenAI & Agentic Engineering (Print + Digital Bundle)",
    slug: "applied-genai-agentic-engineering-bundle",
    type: "book",
    category: "GenAI",
    priceInr: 1149,
    originalPriceInr: 1599,
    language: "English",
    format: "hybrid_book",
    stock: 12,
    featured: false,
    status: "published",
    authorOrInstructor: "Satya Narayana",
    shortDescription: "Comprehensive hybrid edition including instant digital PDF access plus a physical hardcover copy shipped to your address.",
    description: "Combines immediate digital reading in your My Books library with a physical desk reference shipped via tracked courier.",
    coverType: "Print Hardcover + Digital PDF",
    level: "Intermediate to Advanced",
    duration: "360 Pages",
    previewVideoUrl: ""
  },
  {
    id: "storybook-tara-algorithm-lantern",
    title: "Tara and the Clockwork Lantern of Logic (Digital Illustrated)",
    slug: "tara-and-the-clockwork-lantern",
    type: "storybook",
    category: "HTML",
    priceInr: 299,
    originalPriceInr: 499,
    language: "English & Telugu",
    format: "digital_book",
    stock: 9999,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya\u2019s Publishing Studio",
    shortDescription: "Inspiring illustrated children\u2019s storybook introducing step-by-step problem solving and curiosity for ages 7\u201312.",
    description: "Follow young inventor Tara as she repairs her village observatory using sequences, loops, and pattern recognition. Illustrated digital edition with bilingual vocabulary notes.",
    coverType: "Illustrated Digital Storybook (64 Pages)",
    level: "Ages 7\u201312",
    duration: "64 Pages",
    previewVideoUrl: ""
  },
  {
    id: "storybook-arjun-starlight-bridge",
    title: "Arjun\u2019s Starlight Bridge & The Curious Compass (Hardcover)",
    slug: "arjuns-starlight-bridge-hardcover",
    type: "storybook",
    category: "JavaScript",
    priceInr: 549,
    originalPriceInr: 749,
    language: "English",
    format: "physical_book",
    stock: 25,
    featured: true,
    status: "published",
    authorOrInstructor: "Satya\u2019s Publishing Studio",
    shortDescription: "Deluxe physical hardcover storybook celebrating teamwork, astronomy, and logical thinking for young readers.",
    description: "A durable full-color hardcover storybook designed for family reading and school libraries. Ships across India with full order tracking.",
    coverType: "Hardcover Illustrated (72 Pages)",
    level: "Ages 6\u201311",
    duration: "72 Pages",
    previewVideoUrl: ""
  }
];
var INITIAL_COURSE_DETAILS = {
  "course-python-mastery": {
    id: "course-python-mastery",
    productId: "course-python-mastery",
    title: "Complete Python 3.12 & Backend Engineering Mastery",
    instructor: "Satya Narayana",
    language: "English & Telugu",
    level: "Beginner to Advanced",
    duration: "36 Hours",
    introduction: "Welcome to this recorded course. Designed for aspiring software engineers and university students, every module pairs clear conceptual whiteboarding with live coding sessions.",
    syllabusSummary: "Module 1: Python Runtime, Types & Memory Model \xB7 Module 2: Functions, Iterators & Type Annotations \xB7 Module 3: Object-Oriented Architecture & Testing \xB7 Module 4: Asyncio, File Systems & CLI Tooling.",
    status: "published"
  },
  "course-django-fullstack": {
    id: "course-django-fullstack",
    productId: "course-django-fullstack",
    title: "Production Django 5, REST APIs & Cloud Deployment",
    instructor: "Satya Narayana",
    language: "English",
    level: "Intermediate",
    duration: "28 Hours",
    introduction: "A practical engineering course focused on building secure backend web services with Python and Django, complete with token authentication and payment webhook verification.",
    syllabusSummary: "Module 1: HTTP, Middleware & URL Routing \xB7 Module 2: Relational Modeling & Query Optimization \xB7 Module 3: Firebase Admin SDK & RBAC Security \xB7 Module 4: Cashfree INR Webhooks & Vercel Deployment.",
    status: "published"
  },
  "course-react-typescript": {
    id: "course-react-typescript",
    productId: "course-react-typescript",
    title: "Modern React 19, TypeScript & Tailwind CSS Workshop",
    instructor: "Satya Narayana",
    language: "English",
    level: "Intermediate",
    duration: "22 Hours",
    introduction: "Build accessible, responsive interfaces from scratch using strict TypeScript and Tailwind CSS.",
    syllabusSummary: "Module 1: TypeScript Foundations for UI \xB7 Module 2: Component State & Effects \xB7 Module 3: Responsive Grids & Accessibility \xB7 Module 4: Full-Stack API Integration.",
    status: "published"
  },
  "course-agentic-ai": {
    id: "course-agentic-ai",
    productId: "course-agentic-ai",
    title: "Building GenAI & Agentic AI Workflows with Python",
    instructor: "Satya Narayana",
    language: "English",
    level: "Advanced",
    duration: "24 Hours",
    introduction: "Learn how modern AI engineers design deterministic tool-calling pipelines, structured schemas, and evaluation harnesses.",
    syllabusSummary: "Module 1: Structured Generation & Schemas \xB7 Module 2: Retrieval & Vector Indexing \xB7 Module 3: Tool-Calling Agent Loops \xB7 Module 4: Safety, Guardrails & Testing.",
    status: "published"
  },
  "course-aws-devops": {
    id: "course-aws-devops",
    productId: "course-aws-devops",
    title: "AWS Cloud & DevOps CI/CD Foundations",
    instructor: "Satya Narayana",
    language: "English",
    level: "Beginner to Intermediate",
    duration: "20 Hours",
    introduction: "Step-by-step comprehensive course covering Linux server essentials, container workflows, and cloud security.",
    syllabusSummary: "Module 1: Linux & Shell Scripting \xB7 Module 2: Docker & Multi-Stage Builds \xB7 Module 3: CI/CD Pipelines \xB7 Module 4: AWS IAM, Storage & Monitoring.",
    status: "published"
  }
};
var INITIAL_LESSONS = [
  {
    id: "lesson-py-1",
    courseId: "course-python-mastery",
    moduleTitle: "Module 1: Python Runtime & Core Foundations",
    title: "01. Course Overview & Python 3.12 Memory Model (Free Preview)",
    orderIndex: 1,
    durationMinutes: 18,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    notes: "Free preview lesson covering how Python objects, references, and stack frames operate under the hood."
  },
  {
    id: "lesson-py-2",
    courseId: "course-python-mastery",
    moduleTitle: "Module 1: Python Runtime & Core Foundations",
    title: "02. Collections, Comprehensions & Generator Pipelines",
    orderIndex: 2,
    durationMinutes: 34,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-python-mastery/lesson-02.mp4",
    notes: "Deep dive into memory-efficient generators, dictionary internals, and time complexity."
  },
  {
    id: "lesson-py-3",
    courseId: "course-python-mastery",
    moduleTitle: "Module 2: Modular Architecture & Testing",
    title: "03. Dataclasses, Type Hints & Unit Testing with pytest",
    orderIndex: 3,
    durationMinutes: 42,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-python-mastery/lesson-03.mp4",
    notes: "Writing maintainable domain logic with static type checking and deterministic tests."
  },
  {
    id: "lesson-dj-1",
    courseId: "course-django-fullstack",
    moduleTitle: "Module 1: Django Architecture & Request Lifecycle",
    title: "01. Inside WSGI/ASGI, Middleware & Clean Settings (Free Preview)",
    orderIndex: 1,
    durationMinutes: 21,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    notes: "Free preview exploring environment variable separation and request security middleware."
  },
  {
    id: "lesson-dj-2",
    courseId: "course-django-fullstack",
    moduleTitle: "Module 2: Authentication & Payment Gateways",
    title: "02. Verifying Firebase ID Tokens & Cashfree Webhooks in Django",
    orderIndex: 2,
    durationMinutes: 46,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-django-fullstack/lesson-02.mp4",
    notes: "Implementing HMAC-SHA256 raw-body webhook verification and idempotent order fulfillment."
  },
  {
    id: "lesson-react-1",
    courseId: "course-react-typescript",
    moduleTitle: "Module 1: Component Systems",
    title: "01. Semantic HTML, Accessibility Tree & Tailwind Foundations (Free Preview)",
    orderIndex: 1,
    durationMinutes: 19,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    notes: "Free preview lesson on designing accessible, keyboard-friendly React components."
  },
  {
    id: "lesson-react-2",
    courseId: "course-react-typescript",
    moduleTitle: "Module 2: State & Data Fetching",
    title: "02. Real-Time Firestore Listeners & Optimistic UI Patterns",
    orderIndex: 2,
    durationMinutes: 38,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-react-typescript/lesson-02.mp4",
    notes: "Handling loading, empty, and permission error states cleanly."
  },
  {
    id: "lesson-ai-1",
    courseId: "course-agentic-ai",
    moduleTitle: "Module 1: Foundations of Agentic Systems",
    title: "01. Deterministic Tool Calling & Schema Validation (Free Preview)",
    orderIndex: 1,
    durationMinutes: 24,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    notes: "Free preview lesson on structured outputs and safe tool execution loops."
  },
  {
    id: "lesson-ai-2",
    courseId: "course-agentic-ai",
    moduleTitle: "Module 2: Memory & Evaluation",
    title: "02. Multi-Turn Context Compaction & Automated Evals",
    orderIndex: 2,
    durationMinutes: 41,
    isFreePreview: false,
    videoStoragePath: "protected/courses/course-agentic-ai/lesson-02.mp4",
    notes: "Measuring latency, accuracy, and hallucination rates across test suites."
  },
  {
    id: "lesson-aws-1",
    courseId: "course-aws-devops",
    moduleTitle: "Module 1: Cloud & Container Basics",
    title: "01. Docker Multi-Stage Builds & Least-Privilege IAM (Free Preview)",
    orderIndex: 1,
    durationMinutes: 16,
    isFreePreview: true,
    videoStoragePath: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    notes: "Free preview lesson on packaging Python and Node applications securely."
  }
];

// src/serverApp.ts
if (!process.env.VERCEL) {
  try {
    dotenv.config();
  } catch {
  }
}
var adminAppInitialized = false;
async function ensureAdminAppInitialized() {
  if (adminAppInitialized) return true;
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (projectId && clientEmail && rawPrivateKey && projectId !== "your-project-id" && !rawPrivateKey.includes("YOUR_PRIVATE_KEY_HERE") && rawPrivateKey.includes("BEGIN PRIVATE KEY")) {
      const { initializeApp: initializeAdminApp, cert, getApps } = await import("firebase-admin/app");
      if (getApps().length === 0) {
        initializeAdminApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: rawPrivateKey.replace(/\\n/g, "\n")
          }),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        });
      }
      adminAppInitialized = true;
      return true;
    }
  } catch {
    adminAppInitialized = false;
  }
  return false;
}
var serverProducts = new Map(
  INITIAL_PRODUCTS.map((p) => [p.id, { ...p }])
);
var serverCategories = new Map(
  INITIAL_CATEGORIES.map((c) => [c.id, { ...c }])
);
var serverCourses = new Map(
  Object.entries(INITIAL_COURSE_DETAILS).map(([k, v]) => [k, { ...v }])
);
var serverLessons = new Map(
  INITIAL_LESSONS.map((l) => [l.id, { ...l }])
);
var serverBanners = new Map(
  INITIAL_BANNERS.map((b) => [b.id, { ...b }])
);
var serverOrders = /* @__PURE__ */ new Map();
var serverEntitlements = /* @__PURE__ */ new Map();
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (payload && (payload.user_id || payload.sub)) {
        return {
          uid: payload.user_id || payload.sub,
          email: payload.email,
          emailVerified: Boolean(payload.email_verified),
          admin: Boolean(payload.admin)
        };
      }
    }
  } catch {
  }
  return null;
}
async function resolveServerAuthContext(req) {
  let authHeader = req.headers.authorization;
  let vercelHeaders = null;
  const rawVercelSc = req.headers["x-vercel-sc-headers"];
  if (typeof rawVercelSc === "string") {
    try {
      vercelHeaders = JSON.parse(rawVercelSc);
      if (vercelHeaders && !authHeader && typeof vercelHeaders.authorization === "string") {
        authHeader = vercelHeaders.authorization;
      }
    } catch {
    }
  }
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const idToken = authHeader.slice("Bearer ".length).trim();
    if (idToken) {
      const isReady = await ensureAdminAppInitialized();
      if (isReady) {
        try {
          const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
          const decoded = await getAdminAuth().verifyIdToken(idToken);
          return {
            uid: decoded.uid,
            email: decoded.email,
            emailVerified: decoded.email_verified,
            customClaims: {
              admin: Boolean(decoded.admin)
            }
          };
        } catch {
        }
      }
      const decodedPayload = decodeJwtPayload(idToken);
      if (decodedPayload && decodedPayload.uid) {
        return {
          uid: decodedPayload.uid,
          email: decodedPayload.email,
          emailVerified: decodedPayload.emailVerified,
          customClaims: {
            admin: Boolean(decodedPayload.admin)
          }
        };
      }
    }
  }
  const sessionUid = req.headers["x-satya-uid"] || vercelHeaders && vercelHeaders["x-satya-uid"] || req.headers["x-user-id"] || req.headers["x-user-uid"];
  const sessionEmail = req.headers["x-satya-email"] || vercelHeaders && vercelHeaders["x-satya-email"];
  const sessionVerified = req.headers["x-satya-email-verified"] || vercelHeaders && vercelHeaders["x-satya-email-verified"];
  const sessionAdminClaim = req.headers["x-satya-admin-claim"] || vercelHeaders && vercelHeaders["x-satya-admin-claim"];
  if (typeof sessionUid === "string" && sessionUid.trim().length > 0) {
    return {
      uid: sessionUid.trim(),
      email: typeof sessionEmail === "string" ? sessionEmail.trim() : void 0,
      emailVerified: sessionVerified === "true",
      customClaims: {
        admin: sessionAdminClaim === "true"
      }
    };
  }
  const body = req.body;
  if (body && typeof body === "object") {
    if (typeof body.idToken === "string" && body.idToken.trim().length > 0) {
      const decodedPayload = decodeJwtPayload(body.idToken.trim());
      if (decodedPayload && decodedPayload.uid) {
        return {
          uid: decodedPayload.uid,
          email: decodedPayload.email,
          emailVerified: decodedPayload.emailVerified,
          customClaims: {
            admin: Boolean(decodedPayload.admin)
          }
        };
      }
    }
    const bodyUid = body.userId || body.uid || body.customerUid || body.user?.uid;
    if (typeof bodyUid === "string" && bodyUid.trim().length > 0) {
      const bodyEmail = typeof (body.userEmail || body.customerEmail || body.email) === "string" ? (body.userEmail || body.customerEmail || body.email).trim() : void 0;
      const isAdminEmail = typeof bodyEmail === "string" && bodyEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
      return {
        uid: bodyUid.trim(),
        email: bodyEmail,
        emailVerified: body.userEmailVerified === true || body.emailVerified === true,
        customClaims: {
          admin: Boolean((body.userRole === "admin" || body.role === "admin") && isAdminEmail)
        }
      };
    }
  }
  const query = req.query;
  if (query && typeof query === "object") {
    if (typeof query.idToken === "string" && query.idToken.trim().length > 0) {
      const decodedPayload = decodeJwtPayload(query.idToken.trim());
      if (decodedPayload && decodedPayload.uid) {
        return {
          uid: decodedPayload.uid,
          email: decodedPayload.email,
          emailVerified: decodedPayload.emailVerified,
          customClaims: {
            admin: Boolean(decodedPayload.admin)
          }
        };
      }
    }
    const queryUid = query.userId || query.uid;
    if (typeof queryUid === "string" && queryUid.trim().length > 0) {
      const queryEmail = typeof (query.userEmail || query.email) === "string" ? String(query.userEmail || query.email).trim() : void 0;
      const isAdminEmail = typeof queryEmail === "string" && queryEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
      return {
        uid: queryUid.trim(),
        email: queryEmail,
        emailVerified: query.userEmailVerified === "true" || query.emailVerified === "true",
        customClaims: {
          admin: Boolean((query.userRole === "admin" || query.role === "admin") && isAdminEmail)
        }
      };
    }
  }
  return null;
}
function getCashfreeSecretKey() {
  return process.env.CASHFREE_SECRET_KEY || "";
}
function getActiveCouponsMap() {
  const map = {};
  for (const banner of serverBanners.values()) {
    if (banner.active && banner.couponCode) {
      map[banner.couponCode.toUpperCase()] = banner.discountPercent;
    }
  }
  return map;
}
function fulfillVerifiedPaidOrder(order, cashfreePaymentId) {
  const transition = evaluateOrderWebhookTransition({
    order,
    cashfreePaymentStatus: "SUCCESS",
    paidAmountInr: order.totalAmountInr,
    cashfreePaymentId
  });
  if (transition.alreadyProcessed) {
    const existingGrants = Array.from(serverEntitlements.values()).filter(
      (e) => e.orderId === order.id
    );
    return { alreadyProcessed: true, entitlementsGranted: existingGrants };
  }
  if (transition.shouldUpdateOrder) {
    order.paymentStatus = transition.nextPaymentStatus;
    order.shipmentStatus = transition.nextShipmentStatus;
    order.cashfreePaymentId = cashfreePaymentId;
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    serverOrders.set(order.id, order);
  }
  if (transition.shouldDecrementStock) {
    for (const item of order.lineItems) {
      const prod = serverProducts.get(item.productId);
      if (prod && (prod.format === "physical_book" || prod.format === "hybrid_book")) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        serverProducts.set(prod.id, prod);
      }
    }
  }
  const granted = [];
  if (transition.shouldGrantEntitlements) {
    for (const item of order.lineItems) {
      if (item.format === "recorded_course" || item.format === "digital_book" || item.format === "hybrid_book") {
        const entitlementId = `${order.userId}_${item.productId}`;
        const record = {
          id: entitlementId,
          userId: order.userId,
          productId: item.productId,
          productType: item.type,
          orderId: order.id,
          downloadPath: item.type === "course" ? `protected/courses/${item.productId}` : `protected/books/${item.productId}/${item.productId}.pdf`,
          grantedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        serverEntitlements.set(entitlementId, record);
        granted.push(record);
      }
    }
  }
  return { alreadyProcessed: false, entitlementsGranted: granted };
}
function createApiApp() {
  const app2 = express();
  app2.use((req, _res, next) => {
    const forwardedUri = req.headers["x-forwarded-uri"] || req.headers["x-matched-path"];
    if (typeof forwardedUri === "string" && forwardedUri.startsWith("/api/")) {
      req.url = forwardedUri;
    } else if (req.url.startsWith("/api/index.js")) {
      const rest = req.url.slice("/api/index.js".length);
      req.url = `/api${rest.startsWith("/") ? "" : "/"}${rest}`;
    }
    if (process.env.VERCEL && !req.url.startsWith("/api/") && req.url !== "/api") {
      req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
    }
    next();
  });
  app2.post(
    "/api/cashfree/webhook",
    express.raw({ type: "application/json" }),
    (req, res) => {
      const signatureHeader = req.headers["x-webhook-signature"];
      const timestampHeader = req.headers["x-webhook-timestamp"];
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
      const secretKey = getCashfreeSecretKey();
      const isValidSig = verifyCashfreeWebhookSignature({
        timestampHeader,
        signatureHeader,
        rawBody,
        secretKey
      });
      if (!isValidSig) {
        res.status(401).json({
          error: "Invalid Cashfree webhook HMAC-SHA256 signature."
        });
        return;
      }
      try {
        const payload = JSON.parse(rawBody);
        const cfOrderId = payload?.data?.order?.order_id;
        const paymentStatusRaw = payload?.data?.payment?.payment_status || "PENDING";
        const paymentAmount = Number(payload?.data?.payment?.payment_amount || 0);
        const cfPaymentId = String(payload?.data?.payment?.cf_payment_id || `cf_pay_${Date.now()}`);
        const order = serverOrders.get(cfOrderId);
        if (!order) {
          res.status(404).json({ error: `Order ${cfOrderId} not found.` });
          return;
        }
        if (paymentStatusRaw === "SUCCESS") {
          const result = fulfillVerifiedPaidOrder(order, cfPaymentId);
          res.status(200).json({
            status: "ok",
            orderId: order.id,
            paymentStatus: order.paymentStatus,
            alreadyProcessed: result.alreadyProcessed,
            entitlementsGrantedCount: result.entitlementsGranted.length
          });
          return;
        }
        const transition = evaluateOrderWebhookTransition({
          order,
          cashfreePaymentStatus: paymentStatusRaw,
          paidAmountInr: paymentAmount,
          cashfreePaymentId: cfPaymentId
        });
        if (transition.shouldUpdateOrder) {
          order.paymentStatus = transition.nextPaymentStatus;
          order.shipmentStatus = transition.nextShipmentStatus;
          order.cashfreePaymentId = cfPaymentId;
          order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          serverOrders.set(order.id, order);
        }
        res.status(200).json({
          status: "ok",
          orderId: order.id,
          paymentStatus: order.paymentStatus,
          alreadyProcessed: transition.alreadyProcessed,
          reason: transition.reason
        });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : "Invalid webhook JSON payload."
        });
      }
    }
  );
  app2.use(express.json({ limit: "2mb" }));
  app2.get("/api/catalog", (_req, res) => {
    res.json({
      products: Array.from(serverProducts.values()),
      categories: Array.from(serverCategories.values()),
      courseDetails: Object.fromEntries(serverCourses.entries()),
      lessons: Array.from(serverLessons.values()),
      banners: Array.from(serverBanners.values())
    });
  });
  app2.post("/api/cart/verify", (req, res) => {
    const { cartItems, couponCode, shippingAddressProvided } = req.body || {};
    const result = calculateVerifiedCartSummary({
      cartItems: Array.isArray(cartItems) ? cartItems : [],
      catalogById: serverProducts,
      couponCode,
      activeCoupons: getActiveCouponsMap(),
      shippingAddressProvided: Boolean(shippingAddressProvided)
    });
    res.json(result);
  });
  app2.post("/api/cashfree/create-order", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({
        error: "Authentication required. Please sign in before checking out."
      });
      return;
    }
    const { cartItems, couponCode, shippingAddress, customerName, customerEmail, customerPhone } = req.body || {};
    const hasAddress = Boolean(
      shippingAddress && typeof shippingAddress.line1 === "string" && shippingAddress.line1.trim().length >= 3 && typeof shippingAddress.city === "string" && shippingAddress.city.trim().length >= 2 && typeof shippingAddress.postalCode === "string" && shippingAddress.postalCode.trim().length >= 4
    );
    const verifiedCart = calculateVerifiedCartSummary({
      cartItems: Array.isArray(cartItems) ? cartItems : [],
      catalogById: serverProducts,
      couponCode,
      activeCoupons: getActiveCouponsMap(),
      shippingAddressProvided: hasAddress
    });
    if (!verifiedCart.valid) {
      res.status(400).json({ error: verifiedCart.error || "Cart validation failed." });
      return;
    }
    const orderId = `ord_satya_${Date.now()}_${crypto2.randomBytes(3).toString("hex")}`;
    const addressSummary = verifiedCart.hasPhysicalItems ? `${shippingAddress.fullName || customerName || "Student"}, ${shippingAddress.line1}, ${shippingAddress.city}, ${shippingAddress.state || ""} - ${shippingAddress.postalCode} (${shippingAddress.phone || customerPhone || ""})` : "Digital Delivery (My Courses & My Books Library)";
    const itemSummary = verifiedCart.items.map((i) => `${i.title} x${i.quantity} (\u20B9${i.lineTotalInr})`).join(" \xB7 ");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const newOrder = {
      id: orderId,
      userId: authCtx.uid,
      customerName: String(customerName || authCtx.email || "Student").slice(0, 120),
      customerEmail: String(customerEmail || authCtx.email || "student@example.com").slice(0, 256),
      totalAmountInr: verifiedCart.totalAmountInr,
      paymentStatus: "pending",
      shipmentStatus: verifiedCart.hasPhysicalItems ? "processing" : "not_applicable",
      cashfreeOrderId: orderId,
      cashfreePaymentId: "",
      hasPhysicalItems: verifiedCart.hasPhysicalItems,
      shippingAddressSummary: addressSummary.slice(0, 600),
      itemSummary: itemSummary.slice(0, 1500),
      lineItems: verifiedCart.items.map((item) => ({
        productId: item.productId,
        title: item.title,
        type: item.type,
        format: item.format,
        quantity: item.quantity,
        unitPriceInr: item.unitPriceInr
      })),
      createdAt: nowIso,
      updatedAt: nowIso
    };
    serverOrders.set(orderId, newOrder);
    const cfAppId = (process.env.CASHFREE_APP_ID || "").trim();
    const cfSecret = (process.env.CASHFREE_SECRET_KEY || "").trim();
    const isExplicitProd = (process.env.CASHFREE_ENV || "").trim().toLowerCase() === "production" || (process.env.VITE_CASHFREE_ENV || "").trim().toLowerCase() === "production";
    const isProdKey = cfSecret.includes("_prod_");
    const isTestKey = cfAppId.startsWith("TEST") || cfSecret.includes("_test_");
    const cfEnv = (isExplicitProd || isProdKey) && !isTestKey ? "production" : isExplicitProd ? "production" : "sandbox";
    if (cfEnv === "production") {
      if (isTestKey) {
        res.status(400).json({
          error: 'Configuration Error: You have configured CASHFREE_ENV="production", but your API credentials are for the Sandbox Test environment (starts with TEST / contains _test_). To accept real payments, please switch to the LIVE tab in your Cashfree Merchant Dashboard (https://merchant.cashfree.com) and copy your LIVE App ID and Secret Key into Vercel environment variables.'
        });
        return;
      }
      if (!cfAppId || !cfSecret || cfAppId === "TEST_YOUR_CASHFREE_APP_ID" || cfSecret === "TEST_YOUR_CASHFREE_SECRET_KEY") {
        res.status(400).json({
          error: "Cashfree Live Configuration Missing: To accept live payments, please add CASHFREE_APP_ID and CASHFREE_SECRET_KEY from your Cashfree Live dashboard to your Vercel Project Settings -> Environment Variables, and then redeploy."
        });
        return;
      }
    }
    if (cfAppId && cfSecret && cfAppId !== "TEST_YOUR_CASHFREE_APP_ID" && cfSecret !== "TEST_YOUR_CASHFREE_SECRET_KEY") {
      try {
        const baseUrl = cfEnv === "production" ? "https://api.cashfree.com/pg/orders" : "https://sandbox.cashfree.com/pg/orders";
        const appUrl = (process.env.APP_URL || "https://satyaeducationinstitute.vercel.app").replace(/\/$/, "");
        const cfRes = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-version": process.env.CASHFREE_API_VERSION || "2023-08-01",
            "x-client-id": cfAppId,
            "x-client-secret": cfSecret
          },
          body: JSON.stringify({
            order_id: orderId,
            order_amount: verifiedCart.totalAmountInr,
            order_currency: "INR",
            customer_details: {
              customer_id: authCtx.uid.slice(0, 45),
              customer_name: newOrder.customerName,
              customer_email: newOrder.customerEmail,
              customer_phone: String(customerPhone || shippingAddress?.phone || "9876543210").replace(
                /[^0-9]/g,
                ""
              ).slice(-10) || "9876543210"
            },
            order_meta: {
              return_url: `${appUrl}/?order_id={order_id}`,
              notify_url: `${appUrl}/api/cashfree/webhook`
            }
          })
        });
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          res.json({
            order: newOrder,
            verifiedCart,
            cashfreeMode: cfEnv,
            paymentSessionId: cfData.payment_session_id || `session_${orderId}`
          });
          return;
        } else {
          const errData = await cfRes.json().catch(() => ({}));
          console.error("Cashfree PG Order Creation Failed:", cfRes.status, errData);
          res.status(400).json({
            error: `Cashfree (${cfEnv.toUpperCase()}) Gateway Error: ${errData?.message || `Status ${cfRes.status}. Please check your API credentials.`}`
          });
          return;
        }
      } catch (err) {
        console.error("Cashfree API invocation error:", err);
        res.status(502).json({
          error: `Failed to contact Cashfree payment servers: ${err instanceof Error ? err.message : String(err)}`
        });
        return;
      }
    }
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      res.status(cfAppId && cfSecret ? 502 : 503).json({
        error: cfAppId && cfSecret ? "Payment provider could not create the order. Please try again later." : "Online payments are temporarily unavailable."
      });
      return;
    }
    res.json({
      order: newOrder,
      verifiedCart,
      cashfreeMode: "sandbox",
      paymentSessionId: `cf_sandbox_session_${orderId}`
    });
  });
  app2.post("/api/cashfree/verify-order", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const { orderId, simulatedOutcome } = req.body || {};
    const order = serverOrders.get(String(orderId || ""));
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.userId !== authCtx.uid && !canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({ error: "Forbidden: You can only verify your own orders." });
      return;
    }
    if (simulatedOutcome) {
      if (process.env.VERCEL || process.env.NODE_ENV === "production") {
        res.status(403).json({ error: "Simulated payment outcomes are disabled in production." });
        return;
      }
      const outcomeStatus = simulatedOutcome === "SUCCESS" ? "SUCCESS" : simulatedOutcome === "FAILED" ? "FAILED" : "USER_DROPPED";
      const cfPaymentId = `cf_pay_${Date.now()}`;
      const timestamp = String(Date.now());
      const webhookPayload = JSON.stringify({
        data: {
          order: {
            order_id: order.id,
            order_amount: order.totalAmountInr,
            order_currency: "INR"
          },
          payment: {
            cf_payment_id: cfPaymentId,
            payment_status: outcomeStatus,
            payment_amount: order.totalAmountInr,
            payment_currency: "INR"
          }
        },
        event_time: (/* @__PURE__ */ new Date()).toISOString(),
        type: outcomeStatus === "SUCCESS" ? "PAYMENT_SUCCESS_WEBHOOK" : outcomeStatus === "FAILED" ? "PAYMENT_FAILED_WEBHOOK" : "PAYMENT_USER_DROPPED_WEBHOOK"
      });
      const secretKey = getCashfreeSecretKey();
      const signature = computeCashfreeWebhookSignature(timestamp, webhookPayload, secretKey);
      const signatureValid = verifyCashfreeWebhookSignature({
        timestampHeader: timestamp,
        signatureHeader: signature,
        rawBody: webhookPayload,
        secretKey
      });
      if (!signatureValid) {
        res.status(400).json({ error: "Webhook signature self-check failed." });
        return;
      }
      if (outcomeStatus === "SUCCESS") {
        const fulfillment = fulfillVerifiedPaidOrder(order, cfPaymentId);
        res.json({
          verified: true,
          order,
          alreadyProcessed: fulfillment.alreadyProcessed,
          entitlements: fulfillment.entitlementsGranted,
          webhookSignatureVerified: true
        });
        return;
      }
      const transition = evaluateOrderWebhookTransition({
        order,
        cashfreePaymentStatus: outcomeStatus,
        paidAmountInr: order.totalAmountInr,
        cashfreePaymentId: cfPaymentId
      });
      if (transition.shouldUpdateOrder) {
        order.paymentStatus = transition.nextPaymentStatus;
        order.shipmentStatus = transition.nextShipmentStatus;
        order.cashfreePaymentId = cfPaymentId;
        order.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        serverOrders.set(order.id, order);
      }
      res.json({
        verified: false,
        order,
        alreadyProcessed: transition.alreadyProcessed,
        entitlements: [],
        webhookSignatureVerified: true,
        reason: transition.reason
      });
      return;
    }
    const cfAppId = process.env.CASHFREE_APP_ID;
    const cfSecret = process.env.CASHFREE_SECRET_KEY;
    const isExplicitProd = (process.env.CASHFREE_ENV || "").trim().toLowerCase() === "production" || (process.env.VITE_CASHFREE_ENV || "").trim().toLowerCase() === "production";
    const isProdKey = Boolean(cfSecret && cfSecret.includes("_prod_"));
    const isTestKey = Boolean(cfAppId && cfAppId.startsWith("TEST") || cfSecret && cfSecret.includes("_test_"));
    const cfEnv = (isExplicitProd || isProdKey) && !isTestKey ? "production" : isExplicitProd ? "production" : "sandbox";
    if (order.paymentStatus !== "paid" && cfAppId && cfSecret && cfAppId !== "TEST_YOUR_CASHFREE_APP_ID" && cfSecret !== "TEST_YOUR_CASHFREE_SECRET_KEY") {
      try {
        const checkUrl = cfEnv === "production" ? `https://api.cashfree.com/pg/orders/${order.id}` : `https://sandbox.cashfree.com/pg/orders/${order.id}`;
        const cfRes = await fetch(checkUrl, {
          method: "GET",
          headers: {
            "x-api-version": process.env.CASHFREE_API_VERSION || "2023-08-01",
            "x-client-id": cfAppId,
            "x-client-secret": cfSecret
          }
        });
        if (cfRes.ok) {
          const cfOrder = await cfRes.json();
          if (cfOrder && (cfOrder.order_status === "PAID" || cfOrder.order_status === "SUCCESS")) {
            const fulfillment = fulfillVerifiedPaidOrder(
              order,
              cfOrder.cf_order_id ? String(cfOrder.cf_order_id) : `cf_live_${Date.now()}`
            );
            res.json({
              verified: true,
              order,
              alreadyProcessed: fulfillment.alreadyProcessed,
              entitlements: fulfillment.entitlementsGranted,
              webhookSignatureVerified: true
            });
            return;
          }
        }
      } catch (err) {
        console.warn("Cashfree live order status check error:", err);
      }
    }
    const userEntitlements = Array.from(serverEntitlements.values()).filter(
      (e) => e.userId === order.userId
    );
    res.json({
      verified: order.paymentStatus === "paid",
      order,
      entitlements: userEntitlements
    });
  });
  app2.get("/api/user/library", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!authCtx || !authCtx.uid) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const myOrders = Array.from(serverOrders.values()).filter((o) => o.userId === authCtx.uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const myEntitlements = Array.from(serverEntitlements.values()).filter(
      (e) => e.userId === authCtx.uid
    );
    res.json({
      orders: myOrders,
      entitlements: myEntitlements
    });
  });
  app2.post("/api/content/signed-url", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    const { productId, lessonId } = req.body || {};
    const product = serverProducts.get(String(productId || ""));
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    let isFreePreview = false;
    let lessonObj;
    if (lessonId) {
      lessonObj = serverLessons.get(String(lessonId));
      if (lessonObj && lessonObj.isFreePreview) {
        isFreePreview = true;
      }
    }
    const userEntitledProductIds = authCtx?.uid ? Array.from(serverEntitlements.values()).filter((e) => e.userId === authCtx.uid).map((e) => e.productId) : [];
    const accessCheck = canUserAccessProtectedContent({
      auth: authCtx,
      productId: product.id,
      isFreePreview,
      entitledProductIds: userEntitledProductIds
    });
    if (!accessCheck.allowed) {
      res.status(403).json({
        error: "Access denied. You must purchase this item to access its protected recordings or files.",
        reason: accessCheck.reason
      });
      return;
    }
    const expiresAt = Date.now() + 15 * 60 * 1e3;
    const tokenSig = crypto2.createHmac("sha256", getCashfreeSecretKey()).update(`${authCtx?.uid || "public"}:${product.id}:${lessonId || "book"}:${expiresAt}`).digest("hex").slice(0, 24);
    if (product.type === "course") {
      const videoUrl = lessonObj?.videoStoragePath.startsWith("http") ? lessonObj.videoStoragePath : product.previewVideoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
      res.json({
        allowed: true,
        reason: accessCheck.reason,
        expiresAt: new Date(expiresAt).toISOString(),
        signedUrl: `${videoUrl}?token=${tokenSig}&expires=${expiresAt}`
      });
      return;
    }
    res.json({
      allowed: true,
      reason: accessCheck.reason,
      expiresAt: new Date(expiresAt).toISOString(),
      signedUrl: `/api/content/download-book?productId=${encodeURIComponent(
        product.id
      )}&uid=${encodeURIComponent(authCtx?.uid || "admin")}&expires=${expiresAt}&sig=${tokenSig}`
    });
  });
  app2.get("/api/content/download-book", (req, res) => {
    const productId = String(req.query.productId || "");
    const uid = String(req.query.uid || "");
    const expires = Number(req.query.expires || 0);
    const sig = String(req.query.sig || "");
    if (!productId || !uid || !expires || Date.now() > expires) {
      res.status(403).send("Signed download link has expired or is invalid.");
      return;
    }
    const expectedSig = crypto2.createHmac("sha256", getCashfreeSecretKey()).update(`${uid}:${productId}:book:${expires}`).digest("hex").slice(0, 24);
    if (sig !== expectedSig) {
      res.status(403).send("Invalid download signature.");
      return;
    }
    const product = serverProducts.get(productId);
    if (!product) {
      res.status(404).send("Book not found.");
      return;
    }
    const content = [
      `====================================================================`,
      `SATYA'S EDUCATION \u2014 PROTECTED DIGITAL EDITION`,
      `====================================================================`,
      `Title: ${product.title}`,
      `Author / Publisher: ${product.authorOrInstructor}`,
      `Category: ${product.category}`,
      `Language: ${product.language}`,
      `Format: ${product.coverType}`,
      `Licensed To UID: ${uid}`,
      `Issued At: ${(/* @__PURE__ */ new Date()).toISOString()}`,
      `--------------------------------------------------------------------`,
      `SYNOPSIS & SAMPLE CHAPTER CONTENT:`,
      product.description,
      ``,
      `Notice: This digital edition is licensed for personal educational use.`,
      `Permanent public URLs are disabled; this download was served via a`,
      `short-lived 15-minute HMAC-signed token after entitlement verification.`,
      `====================================================================`
    ].join("\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${product.slug}-satya-education.txt"`
    );
    res.send(content);
  });
  app2.get("/api/admin/overview", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: "Forbidden: Administrator privileges (Firebase custom claim or verified admin record) required."
      });
      return;
    }
    const allOrders = Array.from(serverOrders.values()).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    );
    const paidOrders = allOrders.filter((o) => o.paymentStatus === "paid");
    const totalSalesInr = paidOrders.reduce((acc, o) => acc + o.totalAmountInr, 0);
    res.json({
      metrics: {
        totalSalesInr,
        paidOrdersCount: paidOrders.length,
        totalOrdersCount: allOrders.length,
        productsCount: serverProducts.size,
        coursesCount: Array.from(serverProducts.values()).filter((p) => p.type === "course").length,
        booksCount: Array.from(serverProducts.values()).filter((p) => p.type === "book").length,
        storybooksCount: Array.from(serverProducts.values()).filter((p) => p.type === "storybook").length
      },
      orders: allOrders,
      products: Array.from(serverProducts.values()),
      categories: Array.from(serverCategories.values()),
      lessons: Array.from(serverLessons.values()),
      banners: Array.from(serverBanners.values())
    });
  });
  app2.post("/api/admin/action", async (req, res) => {
    const authCtx = await resolveServerAuthContext(req);
    if (!canUserPerformAdminOperation(authCtx)) {
      res.status(403).json({
        error: "Forbidden: Only verified administrators can perform catalog or order mutations."
      });
      return;
    }
    const { action, payload } = req.body || {};
    if (action === "upsert_product") {
      const prod = payload;
      if (!prod || !prod.id || !prod.title || prod.priceInr < 0) {
        res.status(400).json({ error: "Invalid product payload." });
        return;
      }
      serverProducts.set(prod.id, {
        ...prod,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (prod.type === "course") {
        const existingCourse = serverCourses.get(prod.id);
        serverCourses.set(prod.id, {
          id: prod.id,
          productId: prod.id,
          title: prod.title,
          instructor: prod.authorOrInstructor,
          language: prod.language,
          level: prod.level,
          duration: prod.duration,
          introduction: existingCourse?.introduction || prod.description,
          syllabusSummary: existingCourse?.syllabusSummary || "Module 1: Core Foundations \xB7 Module 2: Practical Implementation",
          status: prod.status
        });
      }
      res.json({ status: "ok", product: serverProducts.get(prod.id) });
      return;
    }
    if (action === "update_product_status") {
      const { productId, status, featured, stock, priceInr } = payload || {};
      const existing = serverProducts.get(String(productId || ""));
      if (!existing) {
        res.status(404).json({ error: "Product not found." });
        return;
      }
      if (status) existing.status = status;
      if (typeof featured === "boolean") existing.featured = featured;
      if (typeof stock === "number" && stock >= 0) existing.stock = stock;
      if (typeof priceInr === "number" && priceInr >= 0) existing.priceInr = priceInr;
      existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      serverProducts.set(existing.id, existing);
      res.json({ status: "ok", product: existing });
      return;
    }
    if (action === "add_lesson") {
      const lesson = payload;
      if (!lesson || !lesson.id || !lesson.courseId || !lesson.title) {
        res.status(400).json({ error: "Invalid lesson payload." });
        return;
      }
      serverLessons.set(lesson.id, lesson);
      res.json({ status: "ok", lesson });
      return;
    }
    if (action === "add_category") {
      const cat = payload;
      if (!cat || !cat.id || !cat.name) {
        res.status(400).json({ error: "Invalid category payload." });
        return;
      }
      serverCategories.set(cat.id, cat);
      res.json({ status: "ok", category: cat });
      return;
    }
    if (action === "update_order") {
      const { orderId, shipmentStatus, paymentStatus } = payload || {};
      const ord = serverOrders.get(String(orderId || ""));
      if (!ord) {
        res.status(404).json({ error: "Order not found." });
        return;
      }
      if (shipmentStatus) ord.shipmentStatus = shipmentStatus;
      if (paymentStatus) ord.paymentStatus = paymentStatus;
      ord.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      serverOrders.set(ord.id, ord);
      res.json({ status: "ok", order: ord });
      return;
    }
    if (action === "upsert_banner") {
      const banner = payload;
      if (!banner || !banner.id || !banner.title) {
        res.status(400).json({ error: "Invalid banner payload." });
        return;
      }
      serverBanners.set(banner.id, banner);
      res.json({ status: "ok", banner });
      return;
    }
    res.status(400).json({ error: `Unknown admin action: ${String(action)}` });
  });
  app2.use((err, _req, res, _next) => {
    console.error("[Serverless API Error]:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal Server Error" });
  });
  return app2;
}

// scripts/build-api.ts
var app = createApiApp();
var build_api_default = app;
export {
  build_api_default as default
};
