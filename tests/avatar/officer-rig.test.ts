import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Officer Avatar Rig & Model Validation", () => {
  const modelPath = path.join(process.cwd(), "public/assets/design/sakhi-officer.glb");

  it("exists as a valid GLB binary file", () => {
    expect(fs.existsSync(modelPath)).toBe(true);
    const stats = fs.statSync(modelPath);
    expect(stats.size).toBeGreaterThan(3 * 1024 * 1024); // > 3MB
  });

  it("has valid GLTF 2.0 binary header", () => {
    const buffer = fs.readFileSync(modelPath);
    const magic = buffer.toString("utf8", 0, 4);
    const version = buffer.readUInt32LE(4);
    const length = buffer.readUInt32LE(8);

    expect(magic).toBe("glTF");
    expect(version).toBe(2);
    expect(length).toBe(buffer.length);
  });

  it("preserves all 72 ARKit and Oculus viseme morph targets on Wolf3D_Head", () => {
    const buffer = fs.readFileSync(modelPath);
    const jsonChunkLen = buffer.readUInt32LE(12);
    const jsonChunkType = buffer.readUInt32LE(16);
    expect(jsonChunkType).toBe(0x4E4F534A); // 'JSON'

    const jsonText = buffer.toString("utf8", 20, 20 + jsonChunkLen);
    const gltf = JSON.parse(jsonText);

    const headMesh = gltf.meshes.find((m: any) => m.name === "Wolf3D_Head");
    expect(headMesh).toBeDefined();

    const targetNames = headMesh.extras?.targetNames || [];
    expect(targetNames).toHaveLength(72);

    // Essential speech visemes
    expect(targetNames).toContain("viseme_sil");
    expect(targetNames).toContain("viseme_PP");
    expect(targetNames).toContain("viseme_FF");
    expect(targetNames).toContain("viseme_aa");
    expect(targetNames).toContain("viseme_E");
    expect(targetNames).toContain("viseme_I");
    expect(targetNames).toContain("viseme_O");
    expect(targetNames).toContain("viseme_U");

    // Jaw & eye controls
    expect(targetNames).toContain("jawOpen");
    expect(targetNames).toContain("eyeBlinkLeft");
    expect(targetNames).toContain("eyeBlinkRight");
    expect(targetNames).toContain("mouthSmile");
  });

  it("includes Wolf3D_Officer_Cap parented to Armature and skinned to Head bone", () => {
    const buffer = fs.readFileSync(modelPath);
    const jsonChunkLen = buffer.readUInt32LE(12);
    const jsonText = buffer.toString("utf8", 20, 20 + jsonChunkLen);
    const gltf = JSON.parse(jsonText);

    const capMesh = gltf.meshes.find((m: any) => m.name === "Wolf3D_Officer_Cap");
    expect(capMesh).toBeDefined();
    expect(capMesh.primitives.length).toBeGreaterThan(0);

    const capNode = gltf.nodes.find((n: any) => n.name === "Wolf3D_Officer_Cap");
    expect(capNode).toBeDefined();
    expect(capNode.skin).toBe(0);

    const armatureNode = gltf.nodes.find((n: any) => n.name === "Armature");
    expect(armatureNode).toBeDefined();
    const capNodeIndex = gltf.nodes.indexOf(capNode);
    expect(armatureNode.children).toContain(capNodeIndex);
  });
});
