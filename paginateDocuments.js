
module.exports = async(params, dbQuery, dbCount, url) => {
    let {page, limit, orderBy} = params;
    limit = parseInt(limit);
    page = parseInt(page);

    const count = dbCount;
    const doc = {
        //documents:[],
        links:{
            first:"",
            last:"",
            next:"",
            prev:""
        },
        meta:{
            current_page:"",
            last_page: "",
            path: "",
            per_page:"",
            total:"",
        }
    };

    if(!(Number.isInteger(page) && page > 0 ) || !(Number.isInteger(limit) && limit > 0)){
       page = 1;
       limit = 50;
    }

    const totalPages = Math.ceil(count / limit);

    let documents = await dbQuery.limit(limit * 1).skip((page - 1) * limit);
    doc.documents = documents;

    // let metaUrl = "";
    // if(!isNaN(params.lng) && !isNaN(params.lat)){
    //     metaUrl = `${url}?lat=${params.lat}&lng=${params.lng}`;
    //     url = `${url}?lat=${params.lat}&lng=${params.lng}&`;
    // }else{
    //     metaUrl = `${url}`;
    //     url = `${url}?`;
    // }

    let metaUrl = "";
    if(params && Object.keys(params).length !== 0){
        let urlPathFromQuery = "?";
        let pathArray = [];
        for(const [key,value] of Object.entries(params)){
            if(key !== "page" && key !== "limit"){
                pathArray.push(`${key}=${value}`);
            }
        }
        urlPathFromQuery = `${urlPathFromQuery}${pathArray.join("&")}`;
        metaUrl = `${url}${urlPathFromQuery}`;
        url = `${url}${urlPathFromQuery}&`;
    }else{
        metaUrl = `${url}`;
        url = `${url}?`;
    }

    doc.links.first = `${url}page=1&limit=${limit}`;
    if(totalPages < 1){
        doc.links.last = `${url}page=1&limit=${limit}`;
    }else{
        doc.links.last = `${url}page=${totalPages}&limit=${limit}`;
    }

    if(page !== totalPages){
        doc.links.next = `${url}page=${page+1}&limit=${limit}`;
    }else{
        doc.links.next = `${url}page=${page}&limit=${limit}`;
    }

    if(page > 1){
        doc.links.prev = `${url}page=${page-1}&limit=${limit}`;
    }else{
        doc.links.prev = `${url}page=1&limit=${limit}`;
    }

    doc.meta.current_page = page;
    if(totalPages < 1){
        doc.meta.last_page = 1;
    }else{
        doc.meta.last_page = totalPages;
    }

    //check if orderByHasBeenSet
    // if(orderBy){
    //     doc.meta.next = `${doc.meta.next}&orderBy=${orderBy}`;
    //     doc.meta.prev = `${doc.meta.prev}&orderBy=${orderBy}`;
    // }
    //

    doc.meta.path = `${metaUrl}`;
    doc.meta.per_page = limit;
    doc.meta.total = count;

    return doc;
};
