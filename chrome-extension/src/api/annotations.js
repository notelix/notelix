import { wrapRequestApiRequireLoggedIn } from "./common";
import { decryptFields, encryptFields, getKey } from "../encryption";
import { NotelixChromeStorageKey } from "../popup/consts";
import CryptoJS from "crypto-js";
import supabase from "./supaClient";

const saveAnnotation = async (annotation) => {
  return wrapRequestApiRequireLoggedIn( async () => {
    const key = await getKey();
    const parsedKey = key ? CryptoJS.enc.Hex.parse(key) : null;


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

const deleteAnnotation = ({ uid }) => {
  return wrapRequestApiRequireLoggedIn(async () => {
    const { error } = await supabase
      .from('Annotation')
      .delete()
      .eq( "uid", uid );

    if (error) {
      throw error;
    }
  });
};

const queryAnnotationsByUrl = (url, { onDataReceivedCallback }) => {
  return wrapRequestApiRequireLoggedIn(async () => {
    onDataReceivedCallback();

    const value = await chrome.storage.sync.get(NotelixChromeStorageKey);
    const user = value[NotelixChromeStorageKey].notelixUser;
    if (!user) {
      return;
    }
    if (user.client_side_encryption){
      const annotates = await getDecryptedUserAnnotations(user);
      // console.log(annotates);
      return annotates.filter(annotation => annotation.url === url);
    }
    else {
      const { data, error } = await supabase
      .from('Annotation')
      .select()
      .eq('url', url);

      if (error) {
        throw error;
      }

      return data; 
    }
  });
};


const getDecryptedUserAnnotations = async (user) => {
  const parsedKey = await getKey();
  const key = parsedKey ? CryptoJS.enc.Hex.parse(parsedKey) : null;

  const annotations = await supabase
  .from('Annotation')
  .select()
  .match({
    user: user.id
  });
  if (annotations.error) {
    throw annotations.error;
  }
  return await Promise.all(
    annotations.data.map(async (item) => {
      item.data = await decryptFields({
        key: key,
        object: item.data,
        fields: ["notes", "text", "textAfter", "textBefore"],
        iv: item.uid,
      });

      return decryptFields({
        key: key,
        object: item,
        fields: ["url", "host", "title"],
      });
    })
  );
}


const search = (q) => {
  return wrapRequestApiRequireLoggedIn(async () => {
    // Get user
    const value = await chrome.storage.sync.get(NotelixChromeStorageKey);
    const user = value[NotelixChromeStorageKey].notelixUser;

    if (!user) {
      return;
    }

    if (user.client_side_encryption) {
      // Fetch all annotations from storage
      
      const annotates = await getDecryptedUserAnnotations(user);
      // Filter annotations based on the search query
      // console.log(annotates);
      const filteredAnnotations = annotates.filter(annotation =>
        annotation.title && annotation.title.toLowerCase().includes(q.toLowerCase())
      );

      return filteredAnnotations;
    } else {
      const { data, error } = await supabase
        .from('Annotation')
        .select()
        .ilike('title', `%${q}%`);

      if (error) {
        throw error;
      }

      return data;
    }
  });
};

const findAnnotations = async (params = { selectors: {}, groupBy: "" }) => {
  const { selectors, groupBy } = params;
  // get user
  const value = await chrome.storage.sync.get(NotelixChromeStorageKey);
  const user = value[NotelixChromeStorageKey].notelixUser;
  if (!user) {
      return;
    }
    if (user.client_side_encryption) {
      const annotates = await getDecryptedUserAnnotations(user);
      // Apply selectors
      const filteredAnnotations = annotates.filter(annotation => {
        return Object.keys(selectors).every(key => annotation[key] === selectors[key]);
      });
      // Apply groupBy if specified
      if (groupBy) {
        const groupedAnnotations = filteredAnnotations.reduce((acc, annotation) => {
          const key = annotation[groupBy];
          if (!acc[key]) {
            acc[key] = { [groupBy]: key, count: 0 }; // Initialize with the key and count
          }
          acc[key].count += 1; // Increment the count
          return acc;
        }, {});

        // Convert the accumulator object to an array
        return { list: Object.values(groupedAnnotations) || [] };
      }

      return { list: filteredAnnotations };
      // return filteredAnnotations;
    }
    else {
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
      }
    );
    }
};

export {
  queryAnnotationsByUrl,
  saveAnnotation,
  deleteAnnotation,
  search,
  findAnnotations,
};
