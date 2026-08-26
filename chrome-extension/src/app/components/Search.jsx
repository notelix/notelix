import React from "react";
import debounce from "lodash/debounce";
import {
  deleteAnnotation,
  findAnnotations,
  search,
} from "../../api/annotations";
import "./Search.less";
import { SafeHighlight } from "./SafeHighlight";

export default class Search extends React.Component {
  state = { q: "", data: null };

  debouncedSearch = debounce((query) => {
    search(query).then((resp) => {
      if (this.state.q === query) {
        this.setState({ data: resp.data });
      }
    });
  }, 500);

  componentWillUnmount() {
    this.debouncedSearch.cancel();
  }

  onSearchResultClick = (hit) => {
    window.open(`${hit.url}#notelix:scroll:annotation_id:${hit.id}`);
  };

  render() {
    return (
      <div className="search-root">
        <span className="logo">
          <img src="./public/logo.png" alt="" />
        </span>

        <input
          placeholder="Search..."
          type="text"
          value={this.state.q}
          onChange={(e) => {
            const q = e.target.value;
            this.setState({ q });
            this.debouncedSearch(q);
          }}
        />

        {!!(this.state.data && this.state.q) && (
          <div className="search-result-root">
            <div className="content">
              {!this.state.data.results.hits.length && (
                <div>No results found.</div>
              )}
              {this.state.data.results.hits.map((hit) => {
                return (
                  <div
                    key={hit.id}
                    className="hit"
                    onClick={() => this.onSearchResultClick(hit)}
                  >
                    {hit.textBefore}
                    <div
                      className="text"
                      style={{ textDecorationColor: hit.color }}
                    >
                      <SafeHighlight value={hit._formatted.text} />
                    </div>
                    {hit.textAfter}
                    {!!hit.notes && (
                      <div className="notes-wrapper">
                        <div>
                          <SafeHighlight value={hit._formatted.notes} />
                        </div>
                      </div>
                    )}
                    <div className="url">
                      <span
                        className="color-dot"
                        style={{ background: hit.color }}
                      />
                      <span className="title">
                        <SafeHighlight value={hit._formatted.title} />
                      </span>
                      {hit.url}
                    </div>
                    <a
                      className={"delete-button"}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (
                          !confirm(
                            "Are you sure you want to delete this annotation?"
                          )
                        ) {
                          return;
                        }

                        findAnnotations({
                          groupBy: "",
                          selectors: { id: hit.id },
                        }).then((result) => {
                          const annotationToDelete = result.data.list[0];
                          deleteAnnotation(annotationToDelete).then(() => {
                            this.setState({
                              data: {
                                ...this.state.data,
                                results: {
                                  ...this.state.data.results,
                                  hits: this.state.data.results.hits.filter(
                                    (x) => x.id !== hit.id
                                  ),
                                },
                              },
                            });
                          });
                        });
                      }}
                    >
                      Delete
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
}
