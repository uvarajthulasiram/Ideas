import { HomeSections } from "../components/HomeSections";
import { Page } from "../components/Page";
import { Photo } from "../components/Photo";
import { SearchBar } from "../components/SearchBar";
import { Title } from "../components/Title";
import { content, fill, primaryProperty, site } from "../lib/site";
import { withBase } from "../lib/base";

export default function HomePage() {
  const { hero, closing } = content;
  return (
    <Page>
      <section className="wrap hero">
        <p className="eyebrow">{fill(hero.eyebrow)}</p>
        <h1 className="display">
          <Title text={fill(hero.title)} />
        </h1>
        <p className="lede">{fill(hero.lede)}</p>
        <div className="rule" aria-hidden="true" />
        <p className="hero__facts">{fill(hero.facts)}</p>
      </section>

      <div className="hero-photo">
        <Photo name={hero.photo.photo} caption={hero.photo.caption} sizes="(min-width: 1360px) 1312px, 100vw" variant="hero" priority />
      </div>

      <SearchBar
        properties={site.properties.map((p) => ({ slug: p.slug, name: p.name, maxGuests: p.maxGuests }))}
        timezone={primaryProperty.timezone}
        note={fill(content.searchNote)}
      />

      <HomeSections sections={content.home} />

      {closing && (
        <section className="wrap closing">
          <h2 className="h2">
            <Title text={fill(closing.title)} />
          </h2>
          <a className="button" href={withBase(`/stay/${primaryProperty.slug}/`)}>
            {closing.cta}
          </a>
        </section>
      )}
    </Page>
  );
}
