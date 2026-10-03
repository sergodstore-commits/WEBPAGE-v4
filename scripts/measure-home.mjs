import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Read-only, repeatable laboratory sample. No login, form submission or checkout.
const [base = 'http://localhost:3101', directory = '.data/home-performance'] =
  process.argv.slice(2);
if (base === '--help' || base === '-h') {
  console.log('node scripts/measure-home.mjs <base-url> <output-directory>');
  console.log(
    'Runs one desktop sample and three mobile samples in Chrome. Writes report.json and screenshots.',
  );
  process.exit(0);
}
const url = new URL('/', base).href;
if (!['http:', 'https:'].includes(new URL(url).protocol))
  throw new Error('An HTTP(S) URL is required.');
const output = path.resolve(directory);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: true,
});
const profiles = [
  {
    name: 'desktop',
    samples: 1,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpu: 1,
    network: null,
  },
  {
    name: 'mobile',
    samples: 3,
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    cpu: 4,
    network: { latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 },
  },
];
const report = {
  url,
  recordedAt: new Date().toISOString(),
  browser: browser.version(),
  method: {
    coldCache: true,
    contextPerSample: true,
    locale: 'es-CL',
    timezone: 'America/Santiago',
    profiles,
    settleAfterLoadMs: 3000,
    frameSampleMs: 3000,
    frameSlowThresholdMs: 34,
    cls: 'Maximum layout-shift session sum, excluding recent input; gaps < 1 s and session duration < 5 s.',
    lcp: 'Latest buffered LargestContentfulPaint entry before collecting the sample; page remains visible and no input is dispatched.',
    bytes:
      'CDP Network.loadingFinished encodedDataLength for completed requests (includes response headers); grouped Hero art includes /art/hero/ and Next image URLs referring to that path.',
    limitations: [
      'Chrome headless on this computer, not a real phone or field measurement.',
      'Mobile CPU throttling is relative to the host CPU; bandwidth and latency are simulated with Chrome DevTools Protocol.',
      'requestAnimationFrame intervals estimate main-thread frame cadence, not actual GPU presentation, dropped compositor frames or interaction latency.',
      'The page is measured without scrolling, pointer input, account state or cart state. LCP and CLS are lab snapshots, not full-visit field Core Web Vitals.',
      'Fresh contexts and disabled browser cache do not clear the server/CDN cache. Desktop has one sample; mobile median has only three.',
      'No Lighthouse score or synthetic pass/fail threshold is calculated.',
    ],
  },
  samples: [],
};

function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}

function isHeroArt(rawUrl) {
  const parsed = new URL(rawUrl);
  return (
    parsed.pathname.startsWith('/art/hero/') ||
    (parsed.pathname === '/_next/image' &&
      (parsed.searchParams.get('url') || '').startsWith('/art/hero/'))
  );
}

try {
  for (const profile of profiles) {
    for (let index = 1; index <= profile.samples; index++) {
      const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
        locale: 'es-CL',
        timezoneId: 'America/Santiago',
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
      });
      try {
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        const requests = new Map();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        cdp.on('Network.responseReceived', ({ requestId, response, type }) =>
          requests.set(requestId, {
            url: response.url,
            type,
            status: response.status,
            mimeType: response.mimeType,
            fromDiskCache: Boolean(response.fromDiskCache),
            fromServiceWorker: Boolean(response.fromServiceWorker),
            completed: false,
            encodedBytes: 0,
          }),
        );
        cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
          const record = requests.get(requestId);
          if (record) {
            record.encodedBytes = encodedDataLength;
            record.completed = true;
          }
        });
        await cdp.send('Network.enable');
        await cdp.send('Network.clearBrowserCache');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        if (profile.network)
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            ...profile.network,
            connectionType: 'cellular3g',
          });
        await page.addInitScript(() => {
          const measurements = {
            paints: [],
            lcp: null,
            layoutShifts: [],
            longTasks: [],
            supportedEntryTypes: PerformanceObserver.supportedEntryTypes,
          };
          window.__homeMeasurements = measurements;
          const observe = (type, callback) => {
            if (PerformanceObserver.supportedEntryTypes.includes(type)) {
              new PerformanceObserver((list) => list.getEntries().forEach(callback)).observe({
                type,
                buffered: true,
              });
            }
          };
          observe('paint', (entry) =>
            measurements.paints.push({ name: entry.name, startTime: entry.startTime }),
          );
          observe('largest-contentful-paint', (entry) => {
            measurements.lcp = {
              startTime: entry.startTime,
              size: entry.size,
              url: entry.url,
              element: entry.element?.tagName || null,
              elementId: entry.element?.id || null,
            };
          });
          observe('layout-shift', (entry) =>
            measurements.layoutShifts.push({
              startTime: entry.startTime,
              value: entry.value,
              hadRecentInput: entry.hadRecentInput,
            }),
          );
          observe('longtask', (entry) =>
            measurements.longTasks.push({ startTime: entry.startTime, duration: entry.duration }),
          );
        });
        const response = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
        if (!response?.ok())
          throw new Error(`Home returned HTTP ${response?.status() ?? 'unknown'}`);
        await page
          .locator('[data-testid="home-hero"]')
          .waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(report.method.settleAfterLoadMs);
        const frames = await page.evaluate(async (duration) => {
          const intervals = [];
          const startedAt = performance.now();
          let previous = null;
          let first = null;
          return await new Promise((resolve) => {
            const frame = (time) => {
              if (first === null) first = time;
              if (previous !== null) intervals.push(time - previous);
              previous = time;
              if (time - first < duration) requestAnimationFrame(frame);
              else resolve({ startedAt, actualDurationMs: time - first, intervals });
            };
            requestAnimationFrame(frame);
          });
        }, report.method.frameSampleMs);
        const data = await page.evaluate(() => ({
          ...window.__homeMeasurements,
          navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
          collectedAtMs: performance.now(),
          visibility: document.visibilityState,
          motionState: document
            .querySelector('[data-testid="home-hero"]')
            ?.getAttribute('data-motion'),
          overflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        }));
        let cls = 0;
        let session = 0;
        let sessionStart = 0;
        let lastShift = 0;
        for (const shift of data.layoutShifts.filter((entry) => !entry.hadRecentInput)) {
          if (
            session &&
            shift.startTime - lastShift < 1000 &&
            shift.startTime - sessionStart < 5000
          )
            session += shift.value;
          else {
            session = shift.value;
            sessionStart = shift.startTime;
          }
          lastShift = shift.startTime;
          cls = Math.max(cls, session);
        }
        const completed = [...requests.values()].filter((request) => request.completed);
        const heroRequests = completed.filter((request) => isHeroArt(request.url));
        const sample = {
          profile: profile.name,
          sample: index,
          firstContentfulPaintMs:
            data.paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null,
          largestContentfulPaintMs: data.lcp?.startTime ?? null,
          lcpCandidate: data.lcp,
          cls,
          domContentLoadedMs: data.navigation?.domContentLoadedEventEnd ?? null,
          loadEventMs: data.navigation?.loadEventEnd ?? null,
          collectedAtMs: data.collectedAtMs,
          responseBytes: completed.reduce((sum, request) => sum + request.encodedBytes, 0),
          completedRequestCount: completed.length,
          heroBytes: heroRequests.reduce((sum, request) => sum + request.encodedBytes, 0),
          heroRequests,
          longTasks: {
            count: data.longTasks.length,
            totalDurationMs: data.longTasks.reduce((sum, task) => sum + task.duration, 0),
            longestMs: Math.max(0, ...data.longTasks.map((task) => task.duration)),
          },
          frameCadence: {
            startedAtMs: frames.startedAt,
            actualDurationMs: frames.actualDurationMs,
            count: frames.intervals.length,
            medianIntervalMs: quantile(frames.intervals, 0.5),
            p95IntervalMs: quantile(frames.intervals, 0.95),
            intervalsOver34ms: frames.intervals.filter((value) => value > 34).length,
            fractionOver34ms:
              frames.intervals.filter((value) => value > 34).length / frames.intervals.length,
          },
          visibility: data.visibility,
          motionState: data.motionState,
          overflowPx: data.overflowPx,
          supportedEntryTypes: data.supportedEntryTypes,
          pageErrors: errors,
        };
        report.samples.push(sample);
        if (index === 1)
          await page.screenshot({
            path: path.join(output, `${profile.name}.jpg`),
            quality: 85,
            animations: 'allow',
          });
        await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
        console.log(
          `${profile.name} ${index}/${profile.samples}: LCP ${Math.round(sample.largestContentfulPaintMs ?? 0)} ms, CLS ${cls.toFixed(4)}, Hero ${sample.heroBytes} bytes, rAF p95 ${sample.frameCadence.p95IntervalMs?.toFixed(1)} ms`,
        );
      } finally {
        await context.close();
      }
    }
  }
  report.summary = Object.fromEntries(
    profiles.map((profile) => {
      const samples = report.samples.filter((sample) => sample.profile === profile.name);
      const fields = [
        'firstContentfulPaintMs',
        'largestContentfulPaintMs',
        'cls',
        'loadEventMs',
        'responseBytes',
        'heroBytes',
      ];
      return [
        profile.name,
        {
          sampleCount: samples.length,
          median: Object.fromEntries(
            fields.map((field) => [
              field,
              quantile(
                samples.map((sample) => sample[field]).filter((value) => value !== null),
                0.5,
              ),
            ]),
          ),
          frameCadenceMedian: Object.fromEntries(
            ['medianIntervalMs', 'p95IntervalMs', 'fractionOver34ms'].map((field) => [
              field,
              quantile(
                samples.map((sample) => sample.frameCadence[field]),
                0.5,
              ),
            ]),
          ),
        },
      ];
    }),
  );
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report saved: ${path.join(output, 'report.json')}`);
} finally {
  await browser.close();
}
