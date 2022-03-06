import React from "react";
import debounce from "lodash/debounce";
import { search } from "../../api/annotations";
import "./Search.less";

export default class Search extends React.Component {
  state = { q: "", data: null };

  debouncedSearch = debounce(() => {
    search(this.state.q).then((resp) => this.setState({ data: resp.data }));
  }, 500);

  onSearchResultClick = (hit) => {
    window.open(`${hit.url}#notelix:scroll:annotation_id:${hit.id}`);
  };

  render() {
    return (
      <div className="search-root">
        <input
          type="text"
          value={this.state.q}
          onChange={(e) => {
            this.setState({ q: e.target.value });
            this.debouncedSearch();
          }}
        />

        {!!this.state.data && (
          <div>
            {!this.state.data.results.hits.length && (
              <div>No results found.</div>
            )}
            {this.state.data.results.hits.map((hit) => {
              return (
                <div
                  className="hit"
                  onClick={() => this.onSearchResultClick(hit)}
                >
                  {hit.textBefore}
                  <div
                    className="text"
                    style={{ textDecorationColor: hit.color }}
                    dangerouslySetInnerHTML={{
                      __html: hit._formatted.text,
                    }}
                  />
                  {hit.textAfter}
                  <div className="url">
                    <span
                      className="color-dot"
                      style={{ background: hit.color }}
                    />
                    {hit.url}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
}
