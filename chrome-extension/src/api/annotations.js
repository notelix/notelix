import { wrapRequestApiRequireLoggedIn } from "./common";
import { decryptFields, encryptFields, getKey } from "../encryption";
import { NotelixChromeStorageKey } from "../popup/consts";
import CryptoJS from "crypto-js";
import supabase from "./supaClient";

const saveAnnotation = async (annotation) => {
  return wrapRequestApiRequireLoggedIn( async () => {
    const parsedKey = null;

    annotation = await encryptFields({
      key: parsedKey,
      object: annotation,
      fields: ["url", "host", "title"],
    });
    annotation.data = await encryptFields({
      key: parsedKey,
      object: annotation.data,
      fields: ["text", "textAfter", "textBefore", "notes"],
      iv: annotation.uid,
    });


    chrome.storage.sync.get(NotelixChromeStorageKey, async (value) => {
      const user_id = value[NotelixChromeStorageKey].notelixUser.id;

      const exists = await supabase
      .from('Annotation')
      .select()
      .match({
        user: user_id,
        uid: annotation.uid
      });

      var upsertData = {
        url: annotation.url,
        host: annotation.host,
        title: annotation.title,
        data: annotation.data,
        uid: annotation.uid,
        user: user_id
      };

      if (exists.data.length != 0){
        upsertData.id = exists.data[0].id;
      }
      
      const { data, error} = await supabase
      .from('Annotation')
      .upsert(
          upsertData,
          { onConflict: 'uid' }
        )
        .select();
    })
  }  
)}

const deleteAnnotation = ({ url, uid }) => {
  return wrapRequestApiRequireLoggedIn(async () => {
    const { error } = await supabase
      .from('Annotation')
      .delete()
      .match({ url, uid });

    if (error) {
      throw error;
    }
  });
};

const queryAnnotationsByUrl = (url, { onDataReceivedCallback }) => {
  return wrapRequestApiRequireLoggedIn(async () => {
    onDataReceivedCallback();

    const { data, error } = await supabase
      .from('Annotation')
      .select()
      .eq('url', url);

    if (error) {
      throw error;
    }

    const parsedKey = await getKey();
    const key = parsedKey ? CryptoJS.enc.Hex.parse(parsedKey) : null;

    return Promise.all(
      data.map(async (item) => {
        item.data = await decryptFields({
          key: key,
          object: item.data,
          fields: ["notes", "text", "textAfter", "textBefore"],
          iv: item.uid,
        });

        return decryptFields({
          key: key,
          object: item,
          fields: ["url"],
        });
      })
    );
  });
};

const search = (q) => {
  return wrapRequestApiRequireLoggedIn(async () => {
    const { data, error } = await supabase
      .from('Annotation')
      .select()
      .ilike('title', `%${q}%`);

    if (error) {
      throw error;
    }

    return data;
  });
};

const findAnnotations = (params = { selectors: {}, groupBy: "" }) => {
  const { selectors, groupBy } = params;

  return wrapRequestApiRequireLoggedIn(async () => {
    if (!Object.keys(params).includes('groupBy') || groupBy === ""){
      const { data, error } = await supabase
        .from('Annotation')
        .select()
        .match(selectors);

      if (error) {
        throw error;
      }

      return { list: data };
    }
    else {
      if (Object.keys(selectors).length){
        const { data, error } = await supabase
          .rpc('title_group_annotations', {
            "input_host": Object.values(selectors)[0]
          });
        if (error) {
          throw error;
        }

        return { list: data };
      } else {
        const { data, error } = await supabase
          .rpc('host_group_annotations');
        if (error) {
          throw error;
        }

        return { list: data };
      }
    }
  });
};

export {
  queryAnnotationsByUrl,
  saveAnnotation,
  deleteAnnotation,
  search,
  findAnnotations,
};
