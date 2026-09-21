import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  classifyEmail,
  loadArtifact,
  predictProbabilities,
} from "../../lib/ml/inference";
import { ClassifierArtifact } from "../../lib/ml/types";
import { normalizeEmailText, tokenize } from "../../lib/ml/tokenizer";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "ml");

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf-8")) as T;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

const artifact = loadFixture<ClassifierArtifact>("email_classifier_test.json");
const samples = loadFixture<{
  samples: Array<{
    text: string;
    true_label: string;
    predicted_label: string;
    probabilities: Record<string, number>;
  }>;
}>("test_sample_predictions.json").samples;

describe("inference parity with scikit-learn", () => {
  it("reproduces the exact softmax probabilities for recorded samples", () => {
    for (const sample of samples) {
      const { probabilities } = predictProbabilities(sample.text, artifact);
      for (const cls of Object.keys(sample.probabilities)) {
        expect(Math.abs(probabilities[cls] - sample.probabilities[cls])).toBeLessThan(
          1e-6
        );
      }
    }
  });

  it("predicts the same class label as scikit-learn", () => {
    for (const sample of samples) {
      const { label } = predictProbabilities(sample.text, artifact);
      expect(label).toBe(sample.predicted_label);
    }
  });

  it("probabilities sum to 1", () => {
    for (const sample of samples) {
      const { probabilities } = predictProbabilities(sample.text, artifact);
      const total = Object.values(probabilities).reduce((a, b) => a + b, 0);
      expect(Math.abs(total - 1)).toBeLessThan(1e-9);
    }
  });
});

describe("production artifact end-to-end (skipped when absent)", () => {
  const runtimeArtifactPath = join(
    process.cwd(),
    "models",
    "ml",
    "email_classifier.json"
  );
  const runtimeSamplesPath = join(
    process.cwd(),
    "models",
    "ml",
    "sample_predictions.json"
  );

  const hasRuntime = existsSync(runtimeArtifactPath) && existsSync(runtimeSamplesPath);

  it.skipIf(!hasRuntime)("reproduces scikit-learn on the production model", () => {
    const runtimeArtifact = readJson<ClassifierArtifact>(runtimeArtifactPath);
    const runtimeSamples = readJson<{
      predictions: Array<{
        text: string;
        predicted_label: string;
        probabilities: Record<string, number>;
      }>;
    }>(runtimeSamplesPath).predictions;

    expect(runtimeSamples.length).toBeGreaterThan(0);
    for (const sample of runtimeSamples) {
      const { probabilities, label } = predictProbabilities(sample.text, runtimeArtifact);
      expect(label).toBe(sample.predicted_label);
      for (const cls of Object.keys(sample.probabilities)) {
        expect(Math.abs(probabilities[cls] - sample.probabilities[cls])).toBeLessThan(
          1e-6
        );
      }
    }
  });
});

describe("classifyEmail public API", () => {
  it("reports model metadata from the artifact", () => {
    const result = classifyEmail("", "", { artifact });
    expect(result.available).toBe(true);
    expect(result.modelMeta?.f1Macro).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("marks unavailable when the artifact file is missing", () => {
    const result = classifyEmail("subject", "body", {
      artifactPath: join(FIXTURES, "does-not-exist.json"),
    });
    expect(result.available).toBe(false);
    expect(result.label).toBeNull();
    expect(result.unavailableReason).toContain("missing");
  });

  it("rejects unsupported artifact formats", () => {
    expect(() => loadArtifact(join(FIXTURES, "tokenize_cases.json"))).toThrow(
      /Unsupported/
    );
  });
});

describe("classifyEmail text handling", () => {
  it("handles missing subject/body gracefully", () => {
    const a = classifyEmail(null, "hello meeting at noon", { artifact });
    const b = classifyEmail("subject only", null, { artifact });
    expect(a.available).toBe(true);
    expect(b.available).toBe(true);
    expect(a.label).toBeDefined();
    expect(b.label).toBeDefined();
  });

  it("always returns one of the five class labels when available", () => {
    const classes = ["legitimate", "suspicious", "impersonated", "phishing", "fraud-related"];
    for (const text of [
      "meeting minutes and sprint review attached",
      "your paypal account is limited login immediately",
      "urgent wire transfer of outstanding funds",
    ]) {
      const r = classifyEmail(null, text, { artifact });
      expect(r.label).toBeTruthy();
      expect(classes).toContain(r.label);
    }
  });
});