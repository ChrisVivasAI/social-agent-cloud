import { Composition, registerRoot } from "remotion";
import { MotionGraphic, motionGraphicSchema } from "./motion-graphic/index.js";
import {
  TechNewsVideo,
  techNewsVideoSchema,
  calculateTechNewsMetadata,
} from "./tech-news/index.js";
import { QuoteCard, quoteCardSchema } from "./quote-card/index.js";
import {
  ProductShowcase,
  productShowcaseSchema,
  calculateProductShowcaseMetadata,
} from "./product-showcase/index.js";
import {
  AudiogramVideo,
  audiogramSchema,
  calculateAudiogramMetadata,
} from "./audiogram/index.js";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MotionGraphic"
        component={MotionGraphic}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        schema={motionGraphicSchema}
        defaultProps={{
          title: "Your Title Here",
          subtitle: "Subtitle text",
          backgroundColor: "#1a1a2e",
          accentColor: "#e94560",
        }}
      />
      <Composition
        id="TechNewsVideo"
        component={TechNewsVideo}
        durationInFrames={750}
        fps={30}
        width={1080}
        height={1080}
        schema={techNewsVideoSchema}
        calculateMetadata={calculateTechNewsMetadata}
        defaultProps={{
          headline: "Breaking Tech News",
          keyPoints: ["Point 1", "Point 2", "Point 3"],
          sourceUrl: "https://example.com",
          sourceName: "Example",
          scenes: [
            { type: "intro" as const, text: "Coming up", durationInFrames: 60 },
            { type: "headline" as const, text: "Breaking Tech News", durationInFrames: 120 },
            { type: "hero_image" as const, text: "The future of AI", durationInFrames: 120, imageUrl: undefined },
            { type: "key_point" as const, text: "Key Point 1", subtext: "Details here", durationInFrames: 120, imageUrl: undefined },
            { type: "key_point" as const, text: "Key Point 2", subtext: "More details", durationInFrames: 120, imageUrl: undefined },
            { type: "key_point" as const, text: "Key Point 3", subtext: "Final details", durationInFrames: 120, imageUrl: undefined },
            { type: "source" as const, text: "Read more at", subtext: "Example", durationInFrames: 90 },
            { type: "outro" as const, text: "Tech News", durationInFrames: 60 },
          ],
          logoUrl: undefined,
          heroImageUrl: undefined,
          accentColor: "#d97757",
          backgroundColor: "#141413",
          brandName: "Tech News",
        }}
      />
      <Composition
        id="QuoteCard"
        component={QuoteCard}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1080}
        schema={quoteCardSchema}
        defaultProps={{
          quoteText: "The best way to predict the future is to invent it.",
          attribution: "Alan Kay",
          subtitle: "Computer Science Pioneer",
          accentColor: "#d97757",
          backgroundColor: "#141413",
          brandName: "Tech News",
        }}
      />
      <Composition
        id="ProductShowcase"
        component={ProductShowcase}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1080}
        schema={productShowcaseSchema}
        calculateMetadata={calculateProductShowcaseMetadata}
        defaultProps={{
          productName: "Amazing Product",
          tagline: "Revolutionizing the way you work",
          features: [
            { title: "Feature One", description: "Description of feature one" },
            { title: "Feature Two", description: "Description of feature two" },
            { title: "Feature Three", description: "Description of feature three" },
          ],
          ctaText: "Try it today",
          ctaUrl: "https://example.com",
          scenes: [
            { type: "intro" as const, text: "Introducing", durationInFrames: 90 },
            { type: "hero" as const, text: "Hero", durationInFrames: 90, imageUrl: undefined },
            { type: "feature" as const, text: "Feature 1", durationInFrames: 120, featureIndex: 0, imageUrl: undefined },
            { type: "feature" as const, text: "Feature 2", durationInFrames: 120, featureIndex: 1, imageUrl: undefined },
            { type: "feature" as const, text: "Feature 3", durationInFrames: 120, featureIndex: 2, imageUrl: undefined },
            { type: "cta" as const, text: "CTA", durationInFrames: 90 },
            { type: "outro" as const, text: "Outro", durationInFrames: 60 },
          ],
          voiceoverUrl: undefined,
          heroImageUrl: undefined,
          accentColor: "#d97757",
          backgroundColor: "#141413",
          brandName: "Tech News",
        }}
      />
      <Composition
        id="AudiogramVideo"
        component={AudiogramVideo}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1080}
        schema={audiogramSchema}
        calculateMetadata={calculateAudiogramMetadata}
        defaultProps={{
          title: "Podcast Episode",
          captionText: "This is a sample caption text that would be displayed as animated words synced with the audio playback.",
          voiceoverUrl: "https://example.com/audio.mp3",
          durationInFrames: 300,
          accentColor: "#d97757",
          backgroundColor: "#141413",
          brandName: "Tech News",
          waveformSeed: 42,
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
